(function () {
  if (window.__CBF_POKE_TOOL_INITIALIZED__) {
    return;
  }
  window.__CBF_POKE_TOOL_INITIALIZED__ = true;

  // Match 'Colek balik' / 'Poke Back' both as exact label and as prefix in aria-label (e.g. "Colek balik Neko Dayo").
  const POKE_BACK_EXACT_PATTERNS = [
    /^colek balik$/i,
    /^poke back$/i,
    /^membalas colekan$/i,
    /^balas colek$/i
  ];

  const POKE_BACK_ARIA_PREFIX_PATTERNS = [
    /^colek balik\b/i,
    /^poke back\b/i,
    /^membalas colekan\b/i,
    /^balas colek\b/i
  ];

  // Match 'Lihat Lainnya' / 'See More' pagination buttons on Facebook /pokes.
  const SEE_MORE_PATTERNS = [
    /^lihat lainnya$/i,
    /^tampilkan lainnya$/i,
    /^muat lainnya$/i,
    /^see more$/i,
    /^show more$/i,
    /^load more$/i
  ];

  // Cooldown map per element reference so a button is not spammed within 2.5 seconds while GraphQL responds,
  // but if Facebook reuses the exact same DOM row when the friend pokes back again, it WILL be detected and poked again!
  const recentClickTimestamps = new WeakMap();
  const CLICK_COOLDOWN_MS = 2500;

  const state = {
    theme: localStorage.getItem('cbf_theme') || 'light',
    collapsed: false,
    status: 'READY',
    detectedCount: 0,
    pokedSessionCount: 0,
    isProcessing: false,
    cancelRequested: false,
    // Default Auto-Pantau to TRUE so whenever a "Colek balik" button appears, it is immediately poked back.
    autoWatch: localStorage.getItem('cbf_auto_watch') !== 'false',
    autoScroll: localStorage.getItem('cbf_auto_scroll') !== 'false',
    currentBatchPoked: 0,
    delayMode: localStorage.getItem('cbf_delay_mode') || 'safe',
    lastError: null,
    logs: []
  };

  function getDelayRange() {
    if (state.delayMode === 'fast') return [250, 450];
    if (state.delayMode === 'instant') return [35, 60];
    return [650, 1100];
  }

  function randomBetween(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function formatTime() {
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const ss = String(now.getSeconds()).padStart(2, '0');
    return `${hh}:${mm}:${ss}`;
  }

  function addLog(message) {
    const entry = `[${formatTime()}] ${message}`;
    state.logs.unshift(entry);
    if (state.logs.length > 40) {
      state.logs.length = 40;
    }
    renderWidget();
  }

  function matchesPokeText(text) {
    if (!text) return false;
    const normalized = text.replace(/\s+/g, ' ').trim();
    return POKE_BACK_EXACT_PATTERNS.some((regex) => regex.test(normalized));
  }

  function matchesPokeAria(ariaText) {
    if (!ariaText) return false;
    const normalized = ariaText.replace(/\s+/g, ' ').trim();
    return (
      POKE_BACK_EXACT_PATTERNS.some((regex) => regex.test(normalized)) ||
      POKE_BACK_ARIA_PREFIX_PATTERNS.some((regex) => regex.test(normalized))
    );
  }

  function isCurrentlyPokeBackButton(el) {
    if (!el) return false;
    const ariaLabel = el.getAttribute('aria-label') || '';
    const textContent = el.textContent || '';
    return matchesPokeAria(ariaLabel) || matchesPokeText(textContent);
  }

  function isElementClickablePokeButton(el) {
    if (!el || !el.isConnected) return false;
    if (el.disabled || el.getAttribute('aria-disabled') === 'true') return false;

    // Only skip if it does NOT currently say "Colek balik" / "Poke Back"
    // (e.g., when it already changed to "Dicolek" or "Sudah Dicolek Balik").
    if (!isCurrentlyPokeBackButton(el)) {
      return false;
    }

    // If it was explicitly marked as a broken error-simulation button that already threw, skip it.
    if (el.getAttribute('data-cbf-error-skipped') === 'true') {
      return false;
    }

    // Check short cooldown so we don't double-click while Facebook's network request is in flight.
    const lastClickedAt = recentClickTimestamps.get(el) || 0;
    const cooldown = state.delayMode === 'instant' ? 120 : CLICK_COOLDOWN_MS;
    if (Date.now() - lastClickedAt < cooldown) {
      return false;
    }

    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
      return false;
    }
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function matchesSeeMoreLabel(text) {
    if (!text) return false;
    const normalized = text.replace(/\s+/g, ' ').trim();
    return SEE_MORE_PATTERNS.some((regex) => regex.test(normalized));
  }

  function extractTargetName(buttonEl, index) {
    const explicitTarget = buttonEl.getAttribute('data-poke-target');
    if (explicitTarget) return explicitTarget;

    const aria = buttonEl.getAttribute('aria-label') || '';
    const ariaMatch = aria.match(/^(?:colek balik|poke back|membalas colekan|balas colek)\s+(.+)$/i);
    if (ariaMatch && ariaMatch[1]) {
      return ariaMatch[1].trim();
    }

    // Walk up DOM tree to find the specific row container for this friend (supports Facebook's obfuscated div classes).
    let curr = buttonEl.parentElement;
    while (curr && curr !== document.body) {
      const linkOrName = curr.querySelector('[data-friend-name], a[role="link"], a[href*="facebook.com"], strong, h3, h4');
      if (linkOrName && linkOrName.textContent.trim()) {
        const candidateName = linkOrName.textContent.replace(/\s+/g, ' ').trim();
        if (
          candidateName &&
          !matchesPokeText(candidateName) &&
          !/^dicolek$/i.test(candidateName) &&
          candidateName.length < 80
        ) {
          return candidateName;
        }
      }
      curr = curr.parentElement;
    }

    return `Teman #${index + 1}`;
  }

  function findInteractiveButtonAncestor(node) {
    let curr = node;
    while (curr && curr !== document.body) {
      if (
        curr.matches &&
        (curr.matches('div[role="button"], a[role="button"], span[role="button"], button') ||
          curr.getAttribute('tabindex') === '0')
      ) {
        return curr;
      }
      curr = curr.parentElement;
    }
    return null;
  }

  function findPokeBackButtons() {
    const candidates = Array.from(
      document.querySelectorAll(
        'div[role="button"], span[role="button"], a[role="button"], button, [aria-label], span'
      )
    );

    const matched = [];
    const seen = new Set();

    for (const el of candidates) {
      if (el.closest('#cbf-floating-widget') || el.closest('#sandbox-control-bar')) {
        continue;
      }

      const ariaLabel = el.getAttribute('aria-label') || '';
      const directText = el.childElementCount === 0 ? el.textContent || '' : '';

      if (matchesPokeAria(ariaLabel) || matchesPokeText(directText)) {
        const interactiveRoot = findInteractiveButtonAncestor(el) || el;
        if (!seen.has(interactiveRoot) && isElementClickablePokeButton(interactiveRoot)) {
          seen.add(interactiveRoot);
          matched.push(interactiveRoot);
        }
      }
    }

    return matched;
  }

  function findSeeMoreButton() {
    const candidates = Array.from(
      document.querySelectorAll('div[role="button"], span[role="button"], a[role="button"], button, span[dir="auto"]')
    );
    for (const el of candidates) {
      if (el.closest('#cbf-floating-widget') || el.closest('#sandbox-control-bar')) {
        continue;
      }
      const ariaLabel = el.getAttribute('aria-label') || '';
      const directText = el.textContent || '';
      if (matchesSeeMoreLabel(ariaLabel) || matchesSeeMoreLabel(directText)) {
        const interactiveRoot = findInteractiveButtonAncestor(el) || el;
        if (interactiveRoot && interactiveRoot.isConnected) {
          const rect = interactiveRoot.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            return interactiveRoot;
          }
        }
      }
    }
    return null;
  }

  // Dispatch complete Pointer + Mouse + Click sequence required by Facebook Comet React 18 event delegation.
  function triggerHumanizedReactClick(targetEl) {
    const rect = targetEl.getBoundingClientRect();
    const clientX = Math.round(rect.left + rect.width / 2);
    const clientY = Math.round(rect.top + rect.height / 2);

    const hitTarget = document.elementFromPoint(clientX, clientY);
    const dispatchEl =
      hitTarget && targetEl.contains(hitTarget) ? hitTarget : targetEl;

    try {
      if (typeof targetEl.focus === 'function') {
        targetEl.focus({ preventScroll: true });
      }
    } catch (_e) {
      // Ignore focus errors on non-focusable wrappers.
    }

    const commonInit = {
      bubbles: true,
      cancelable: true,
      composed: true,
      view: window,
      clientX,
      clientY,
      screenX: clientX,
      screenY: clientY,
      button: 0,
      buttons: 1
    };

    if (typeof PointerEvent === 'function') {
      dispatchEl.dispatchEvent(
        new PointerEvent('pointerover', { ...commonInit, pointerId: 1, pointerType: 'mouse', isPrimary: true })
      );
      dispatchEl.dispatchEvent(
        new PointerEvent('pointerenter', { ...commonInit, bubbles: false, pointerId: 1, pointerType: 'mouse', isPrimary: true })
      );
      dispatchEl.dispatchEvent(
        new PointerEvent('pointerdown', { ...commonInit, pointerId: 1, pointerType: 'mouse', isPrimary: true, pressure: 0.5 })
      );
    }

    dispatchEl.dispatchEvent(new MouseEvent('mouseover', commonInit));
    dispatchEl.dispatchEvent(new MouseEvent('mousedown', commonInit));

    if (typeof PointerEvent === 'function') {
      dispatchEl.dispatchEvent(
        new PointerEvent('pointerup', {
          ...commonInit,
          buttons: 0,
          pointerId: 1,
          pointerType: 'mouse',
          isPrimary: true,
          pressure: 0
        })
      );
    }

    dispatchEl.dispatchEvent(new MouseEvent('mouseup', { ...commonInit, buttons: 0 }));
    dispatchEl.dispatchEvent(new MouseEvent('click', { ...commonInit, buttons: 0, detail: 1 }));
  }

  async function tryLoadMorePokesFromPage() {
    if (!state.autoScroll) return false;

    const seeMoreBtn = findSeeMoreButton();
    if (seeMoreBtn) {
      addLog('Menekan tombol "Lihat Lainnya" untuk memuat daftar colekan berikutnya...');
      seeMoreBtn.scrollIntoView({ block: 'center', behavior: 'instant' });
      await sleep(60);
      triggerHumanizedReactClick(seeMoreBtn);
      const waitLoad = state.delayMode === 'instant' ? 80 : 900;
      await sleep(waitLoad);
      return findPokeBackButtons().length > 0;
    }

    return false;
  }

  function scanPage(logResult = false) {
    if (state.isProcessing) return findPokeBackButtons();
    try {
      state.lastError = null;
      const buttons = findPokeBackButtons();
      state.detectedCount = buttons.length;

      if (buttons.length === 0) {
        state.status = state.autoWatch ? 'WATCHING' : 'EMPTY';
        if (logResult) {
          addLog(
            state.autoWatch
              ? 'Pemindaian selesai: 0 tombol Colek Balik saat ini. Auto-Pantau siap membalas begitu tombol muncul.'
              : 'Pemindaian selesai: 0 tombol Colek Balik ditemukan.'
          );
        }
      } else {
        state.status = 'READY';
        if (logResult) {
          addLog(`Pemindaian selesai: ${buttons.length} tombol Colek Balik siap dibalas.`);
        }
        if (state.autoWatch && !state.isProcessing) {
          executeOneClickPokeAll(true);
        }
      }
      renderWidget();
      return buttons;
    } catch (err) {
      state.status = 'ERROR';
      state.lastError = err && err.message ? err.message : 'Gagal membaca struktur DOM halaman.';
      addLog(`Galat pemindaian: ${state.lastError}`);
      renderWidget();
      return [];
    }
  }

  async function executeOneClickPokeAll(triggeredByWatcher = false) {
    if (state.isProcessing) {
      if (!triggeredByWatcher) {
        state.cancelRequested = true;
        state.autoWatch = false;
        localStorage.setItem('cbf_auto_watch', 'false');
        addLog('Menghentikan proses & mematikan Auto-Pantau...');
        renderWidget();
      }
      return {
        ok: false,
        status: 'CANCELLED',
        clickedCount: 0,
        failedCount: 0,
        remainingCount: state.detectedCount
      };
    }

    let availableButtons = findPokeBackButtons();
    state.detectedCount = availableButtons.length;

    if (availableButtons.length === 0) {
      state.status = state.autoWatch ? 'WATCHING' : 'EMPTY';
      if (!triggeredByWatcher) {
        addLog('Tidak ada tombol Colek Balik yang aktif di layar saat ini.');
      }
      renderWidget();
      return {
        ok: true,
        status: state.status,
        clickedCount: 0,
        failedCount: 0,
        remainingCount: 0
      };
    }

    state.isProcessing = true;
    state.cancelRequested = false;
    state.status = 'LOADING';
    state.lastError = null;
    state.currentBatchPoked = 0;
    renderWidget();

    const [minDelay, maxDelay] = getDelayRange();
    if (!triggeredByWatcher) {
      addLog(`Membalas semua tombol Colek Balik yang muncul (jeda ${minDelay}-${maxDelay}ms)...`);
    } else {
      addLog(`Tombol Colek Balik terdeteksi (${availableButtons.length} tombol)! Langsung membalas...`);
    }

    let clickedCount = 0;
    let failedCount = 0;
    const clickedNames = [];
    let scrollAttemptsWithoutNew = 0;

    while (!state.cancelRequested) {
      const liveButtons = findPokeBackButtons();
      state.detectedCount = liveButtons.length;

      if (liveButtons.length === 0) {
        if (state.autoScroll && scrollAttemptsWithoutNew < 1) {
          scrollAttemptsWithoutNew += 1;
          const foundMore = await tryLoadMorePokesFromPage();
          if (foundMore) {
            scrollAttemptsWithoutNew = 0;
            continue;
          }
        }
        break;
      }

      scrollAttemptsWithoutNew = 0;
      const btn = liveButtons[0];
      const friendName = extractTargetName(btn, clickedCount);

      try {
        if (btn.getAttribute('data-simulate-error') === 'true') {
          btn.setAttribute('data-cbf-error-skipped', 'true');
          throw new Error(`Tombol untuk ${friendName} menolak interaksi klik.`);
        }

        const rect = btn.getBoundingClientRect();
        if (rect.top < 0 || rect.bottom > window.innerHeight) {
          btn.scrollIntoView({ block: 'center', behavior: 'instant' });
          await sleep(40);
        }

        // Record timestamp cooldown instead of a permanent attribute so if the same friend pokes back 3 seconds later,
        // and Facebook reuses the exact same DOM node, it will immediately be detected and poked again!
        recentClickTimestamps.set(btn, Date.now());
        triggerHumanizedReactClick(btn);

        clickedCount += 1;
        state.currentBatchPoked = clickedCount;
        state.pokedSessionCount += 1;
        clickedNames.push(friendName);
        state.detectedCount = Math.max(0, liveButtons.length - 1);
        addLog(`(#${state.pokedSessionCount}) Mencolek balik ${friendName}`);
      } catch (err) {
        failedCount += 1;
        state.lastError = err && err.message ? err.message : `Gagal mencolek ${friendName}`;
        addLog(`Galat pada ${friendName}: ${state.lastError}`);
      }

      renderWidget();

      if (!state.cancelRequested) {
        const [curMin, curMax] = getDelayRange();
        const waitMs = randomBetween(curMin, curMax);
        await sleep(waitMs);
      }
    }

    state.isProcessing = false;
    state.cancelRequested = false;

    const remainingButtons = findPokeBackButtons();
    state.detectedCount = remainingButtons.length;

    if (failedCount > 0) {
      state.status = 'ERROR';
      addLog(`Selesai dengan kendala: ${clickedCount} berhasil, ${failedCount} gagal.`);
    } else if (state.autoWatch) {
      state.status = 'WATCHING';
      if (clickedCount > 0) {
        const summaryNames = clickedNames.slice(0, 3).join(', ');
        const suffix = clickedNames.length > 3 ? ` +${clickedNames.length - 3} lainnya` : '';
        addLog(`Terbalas ${clickedCount} colekan (${summaryNames}${suffix}). Menunggu tombol Colek Balik berikutnya...`);
      }
    } else {
      state.status = 'DONE';
      const summaryNames = clickedNames.slice(0, 3).join(', ');
      const suffix = clickedNames.length > 3 ? ` +${clickedNames.length - 3} lainnya` : '';
      addLog(`Selesai: ${clickedCount} colekan terkirim ke Facebook (${summaryNames}${suffix}).`);
    }

    renderWidget();
    return {
      ok: failedCount === 0,
      status: state.status,
      clickedCount,
      failedCount,
      remainingCount: state.detectedCount
    };
  }

  function getStatusMeta() {
    switch (state.status) {
      case 'LOADING':
        return {
          badgeText: '[MEMPROSES]',
          badgeState: 'normal',
          message: `Sedang membalas otomatis (Terbalas: ${state.currentBatchPoked} | Antrean layar: ${state.detectedCount})...`
        };
      case 'WATCHING':
        return {
          badgeText: '[AUTO-BALAS AKTIF]',
          badgeState: 'success',
          message: `Siaga penuh: begitu tombol biru "Colek balik" muncul (termasuk teman yang mencolek berulang kali), langsung dibalas otomatis! Total sesi: ${state.pokedSessionCount}.`
        };
      case 'DONE':
        return {
          badgeText: '[SELESAI]',
          badgeState: 'success',
          message: `Semua colekan di layar sudah dibalas. Total sesi ini: ${state.pokedSessionCount} teman.`
        };
      case 'EMPTY':
        return {
          badgeText: '[KOSONG]',
          badgeState: 'normal',
          message: 'Belum ada tombol "Colek Balik" di layar. Aktifkan Auto-Pantau agar otomatis membalas saat tombol muncul.'
        };
      case 'ERROR': {
        const cleanError = (state.lastError || 'Elemen gagal diklik').replace(/\.+$/, '');
        return {
          badgeText: '[GALAT]',
          badgeState: 'error',
          message: `Terjadi kendala: ${cleanError}. Klik Pindai Ulang lalu coba kembali.`
        };
      }
      case 'READY':
      default:
        return {
          badgeText: '[SIAP]',
          badgeState: 'normal',
          message: `Ditemukan ${state.detectedCount} tombol Colek Balik di layar. Tekan tombol utama atau biarkan Auto-Pantau membalas.`
        };
    }
  }

  function buildWidgetDOM() {
    let widget = document.getElementById('cbf-floating-widget');
    if (widget) return widget;

    widget = document.createElement('aside');
    widget.id = 'cbf-floating-widget';
    widget.setAttribute('role', 'region');
    widget.setAttribute('aria-label', 'Panel Colek Balik 1-Klik Facebook');
    widget.setAttribute('data-theme', state.theme);
    widget.setAttribute('data-collapsed', String(state.collapsed));

    widget.innerHTML = `
      <div class="cbf-header">
        <div class="cbf-title-group">
          <h2 class="cbf-title">Colek Balik 1-Klik</h2>
          <p class="cbf-subtitle">Auto-Balas Setiap Tombol Muncul</p>
        </div>
        <div class="cbf-header-controls">
          <button type="button" id="cbf-speed-btn" class="cbf-icon-btn" aria-label="Ubah jeda antar klik">
            Jeda: Aman
          </button>
          <button type="button" id="cbf-theme-btn" class="cbf-icon-btn" aria-label="Ganti tema terang atau gelap">
            Tema
          </button>
          <button type="button" id="cbf-collapse-btn" class="cbf-icon-btn" aria-expanded="true" aria-controls="cbf-widget-body">
            Lipat
          </button>
        </div>
      </div>
      <div id="cbf-widget-body" class="cbf-body">
        <div class="cbf-status-row">
          <span id="cbf-status-badge" class="cbf-badge">[SIAP]</span>
          <span id="cbf-counters" class="cbf-counters">Siap: 0 | Terbalas: 0</span>
        </div>
        <p id="cbf-state-msg" class="cbf-state-message" role="status" aria-live="polite"></p>
        <div class="cbf-actions">
          <button type="button" id="cbf-poke-all-btn" class="cbf-primary-btn">
            Balas Semua Colekan Sekarang (0)
          </button>
          <div class="cbf-secondary-row">
            <button type="button" id="cbf-autowatch-btn" class="cbf-secondary-btn" aria-pressed="true">
              Auto-Pantau: AKTIF (Otomatis Colek)
            </button>
          </div>
          <div class="cbf-secondary-row">
            <button type="button" id="cbf-rescan-btn" class="cbf-secondary-btn">
              Pindai Ulang
            </button>
            <button type="button" id="cbf-clear-log-btn" class="cbf-secondary-btn">
              Bersihkan Log
            </button>
          </div>
        </div>
        <div id="cbf-log-box" class="cbf-log-box" role="log" aria-label="Catatan aktivitas colek balik"></div>
      </div>
    `;

    document.body.appendChild(widget);

    document.getElementById('cbf-poke-all-btn').addEventListener('click', () => {
      // Clear any previous error skips on manual trigger
      document.querySelectorAll('[data-cbf-error-skipped]').forEach((el) => {
        el.removeAttribute('data-cbf-error-skipped');
      });
      executeOneClickPokeAll(false);
    });

    document.getElementById('cbf-autowatch-btn').addEventListener('click', () => {
      state.autoWatch = !state.autoWatch;
      localStorage.setItem('cbf_auto_watch', String(state.autoWatch));
      if (state.autoWatch) {
        addLog('Auto-Pantau DIAKTIFKAN: setiap tombol "Colek balik" yang muncul langsung dibalas otomatis.');
        const pending = findPokeBackButtons();
        if (pending.length > 0 && !state.isProcessing) {
          executeOneClickPokeAll(true);
        } else {
          state.status = 'WATCHING';
          renderWidget();
        }
      } else {
        addLog('Auto-Pantau DIMATIKAN.');
        if (state.isProcessing) {
          state.cancelRequested = true;
        } else {
          scanPage(false);
        }
        renderWidget();
      }
    });

    document.getElementById('cbf-rescan-btn').addEventListener('click', () => {
      scanPage(true);
    });

    document.getElementById('cbf-clear-log-btn').addEventListener('click', () => {
      state.logs = [];
      addLog('Catatan log dibersihkan.');
    });

    document.getElementById('cbf-speed-btn').addEventListener('click', () => {
      if (state.delayMode === 'safe') {
        state.delayMode = 'fast';
      } else if (state.delayMode === 'fast') {
        state.delayMode = 'instant';
      } else {
        state.delayMode = 'safe';
      }
      localStorage.setItem('cbf_delay_mode', state.delayMode);
      const [minD, maxD] = getDelayRange();
      addLog(`Mode jeda diubah ke ${state.delayMode.toUpperCase()} (${minD}-${maxD}ms antar colek).`);
      renderWidget();
    });

    document.getElementById('cbf-theme-btn').addEventListener('click', () => {
      state.theme = state.theme === 'light' ? 'dark' : 'light';
      localStorage.setItem('cbf_theme', state.theme);
      renderWidget();
    });

    document.getElementById('cbf-collapse-btn').addEventListener('click', () => {
      state.collapsed = !state.collapsed;
      renderWidget();
    });

    return widget;
  }

  function renderWidget() {
    const widget = buildWidgetDOM();
    widget.setAttribute('data-theme', state.theme);
    widget.setAttribute('data-collapsed', String(state.collapsed));

    const speedBtn = document.getElementById('cbf-speed-btn');
    if (speedBtn) {
      const labelMap = {
        safe: 'Jeda: Aman',
        fast: 'Jeda: Cepat',
        instant: 'Jeda: Instan'
      };
      speedBtn.textContent = labelMap[state.delayMode] || 'Jeda: Aman';
    }

    const autoWatchBtn = document.getElementById('cbf-autowatch-btn');
    if (autoWatchBtn) {
      autoWatchBtn.textContent = state.autoWatch
        ? 'Auto-Pantau: AKTIF (Otomatis Colek)'
        : 'Auto-Pantau: MATI';
      autoWatchBtn.setAttribute('aria-pressed', String(state.autoWatch));
      autoWatchBtn.setAttribute('data-active', String(state.autoWatch));
    }

    const themeBtn = document.getElementById('cbf-theme-btn');
    if (themeBtn) {
      themeBtn.textContent = state.theme === 'light' ? 'Gelap' : 'Terang';
    }

    const collapseBtn = document.getElementById('cbf-collapse-btn');
    if (collapseBtn) {
      collapseBtn.textContent = state.collapsed ? 'Buka' : 'Lipat';
      collapseBtn.setAttribute('aria-expanded', String(!state.collapsed));
    }

    const meta = getStatusMeta();
    const badgeEl = document.getElementById('cbf-status-badge');
    if (badgeEl) {
      badgeEl.textContent = meta.badgeText;
      badgeEl.setAttribute('data-state', meta.badgeState);
    }

    const countersEl = document.getElementById('cbf-counters');
    if (countersEl) {
      countersEl.textContent = `Siap: ${state.detectedCount} | Terbalas: ${state.pokedSessionCount}`;
    }

    const msgEl = document.getElementById('cbf-state-msg');
    if (msgEl) {
      msgEl.textContent = meta.message;
      msgEl.setAttribute('data-state', meta.badgeState);
    }

    const primaryBtn = document.getElementById('cbf-poke-all-btn');
    if (primaryBtn) {
      if (state.isProcessing) {
        primaryBtn.textContent = `Hentikan Proses (Terbalas: ${state.currentBatchPoked})`;
      } else {
        primaryBtn.textContent = `Balas Semua Colekan Sekarang (${state.detectedCount})`;
      }
      primaryBtn.disabled = false;
    }

    const logBox = document.getElementById('cbf-log-box');
    if (logBox) {
      if (state.logs.length === 0) {
        logBox.innerHTML = '<p class="cbf-log-entry">Belum ada aktivitas. Klik tombol aksi untuk memulai.</p>';
      } else {
        logBox.innerHTML = state.logs
          .map((item) => `<p class="cbf-log-entry">${escapeHtml(item)}</p>`)
          .join('');
      }
    }
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  window.CBFController = {
    scanPage: () => scanPage(true),
    pokeAll: () => {
      document.querySelectorAll('[data-cbf-error-skipped]').forEach((el) => {
        el.removeAttribute('data-cbf-error-skipped');
      });
      return executeOneClickPokeAll(false);
    },
    setAutoWatch: (enabled) => {
      state.autoWatch = Boolean(enabled);
      localStorage.setItem('cbf_auto_watch', String(state.autoWatch));
      if (state.autoWatch && !state.isProcessing && findPokeBackButtons().length > 0) {
        executeOneClickPokeAll(true);
      } else {
        scanPage(false);
      }
    },
    setDelayMode: (mode) => {
      if (mode === 'safe' || mode === 'fast' || mode === 'instant') {
        state.delayMode = mode;
        localStorage.setItem('cbf_delay_mode', mode);
        renderWidget();
      }
    },
    getState: () => ({
      status: state.status,
      isProcessing: state.isProcessing,
      autoWatch: state.autoWatch,
      delayMode: state.delayMode,
      detectedCount: state.detectedCount,
      pokedSessionCount: state.pokedSessionCount,
      lastError: state.lastError,
      theme: state.theme,
      logs: [...state.logs]
    }),
    setTheme: (nextTheme) => {
      if (nextTheme === 'light' || nextTheme === 'dark') {
        state.theme = nextTheme;
        localStorage.setItem('cbf_theme', state.theme);
        renderWidget();
      }
    }
  };

  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
      if (!request || !request.action) return false;
      if (request.action === 'CBF_GET_STATE') {
        scanPage(false);
        sendResponse(window.CBFController.getState());
        return false;
      }
      if (request.action === 'CBF_SCAN') {
        scanPage(true);
        sendResponse(window.CBFController.getState());
        return false;
      }
      if (request.action === 'CBF_TOGGLE_AUTOWATCH') {
        window.CBFController.setAutoWatch(!state.autoWatch);
        sendResponse(window.CBFController.getState());
        return false;
      }
      if (request.action === 'CBF_POKE_ALL') {
        window.CBFController.pokeAll().then((result) => {
          sendResponse({ ...window.CBFController.getState(), result });
        });
        return true;
      }
      return false;
    });
  }

  let scanTimeout = null;
  function handlePotentialNewPokes() {
    if (state.isProcessing) return;
    const buttons = findPokeBackButtons();
    state.detectedCount = buttons.length;

    if (buttons.length > 0 && state.autoWatch) {
      executeOneClickPokeAll(true);
      return;
    }

    if (state.status !== 'DONE' && state.status !== 'ERROR') {
      state.status = state.autoWatch ? 'WATCHING' : buttons.length > 0 ? 'READY' : 'EMPTY';
    }
    renderWidget();
  }

  // Observe childList, characterData, and attribute changes (e.g. when a button in the same row changes from "Dicolek" back to "Colek balik").
  const observer = new MutationObserver((mutations) => {
    if (state.isProcessing) return;
    const shouldRescan = mutations.some((m) => {
      const targetNode = m.target && m.target.nodeType === 1 ? m.target : m.target && m.target.parentElement;
      if (targetNode && targetNode.closest && targetNode.closest('#cbf-floating-widget')) {
        return false;
      }
      return true;
    });

    if (shouldRescan) {
      clearTimeout(scanTimeout);
      scanTimeout = setTimeout(handlePotentialNewPokes, 150);
    }
  });

  // High-responsiveness interval (every 800ms): immediately detects & pokes any "Colek balik" button that appears on screen.
  setInterval(() => {
    if (state.isProcessing) return;
    const pending = findPokeBackButtons();
    if (pending.length !== state.detectedCount) {
      state.detectedCount = pending.length;
      renderWidget();
    }
    if (state.autoWatch && pending.length > 0) {
      executeOneClickPokeAll(true);
    }
  }, 800);

  function init() {
    buildWidgetDOM();
    const initialButtons = findPokeBackButtons();
    state.detectedCount = initialButtons.length;
    addLog(`Panel siap. Terdeteksi ${state.detectedCount} tombol Colek Balik.`);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['aria-label', 'aria-disabled', 'class']
    });
    if (state.autoWatch && state.detectedCount > 0) {
      executeOneClickPokeAll(true);
    } else {
      scanPage(false);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
