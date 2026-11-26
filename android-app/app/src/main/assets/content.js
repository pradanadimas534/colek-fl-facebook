(function () {
  if (window.__CBF_POKE_TOOL_INITIALIZED__) {
    return;
  }
  window.__CBF_POKE_TOOL_INITIALIZED__ = true;

  // 1. Incoming pokes ("Colek balik" / "Poke Back")
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

  // 2. Suggested / Unpoked friends on the /pokes page ("Colek" / "Poke")
  const NEW_POKE_EXACT_PATTERNS = [
    /^colek$/i,
    /^poke$/i
  ];

  const NEW_POKE_ARIA_PREFIX_PATTERNS = [
    /^colek\s+(?!balik\b)/i,
    /^poke\s+(?!back\b)/i
  ];

  // 3. Pagination / Infinite Scroll ("Lihat Lainnya" / "See More")
  const SEE_MORE_PATTERNS = [
    /^lihat lainnya$/i,
    /^tampilkan lainnya$/i,
    /^muat lainnya$/i,
    /^lihat selengkapnya$/i,
    /^see more$/i,
    /^show more$/i,
    /^load more$/i
  ];

  const recentClickTimestamps = new WeakMap();
  const CLICK_COOLDOWN_MS = 3200;

  // Track recent clicks per friend name to catch if the same friend snaps back to blue "Colek balik" within < 3.5 seconds
  const friendLastClickTimeMap = new Map();
  const FAST_SNAPBACK_WINDOW_MS = 3500;

  // Auto-Refresh cycle options (in seconds): 25s, 45s, 15s, 0 (OFF)
  const AUTO_REFRESH_OPTIONS = [25, 45, 15, 0];

  function loadInitialRefreshInterval() {
    const saved = parseInt(localStorage.getItem('cbf_auto_refresh_sec') || '25', 10);
    if (AUTO_REFRESH_OPTIONS.includes(saved)) return saved;
    return 25;
  }

  function loadPersistedSessionCount() {
    const val = parseInt(sessionStorage.getItem('cbf_session_poked_total') || '0', 10);
    return Number.isNaN(val) ? 0 : val;
  }

  function savePersistedSessionCount(count) {
    try {
      sessionStorage.setItem('cbf_session_poked_total', String(count));
    } catch (_e) {
      // Ignore storage quota errors
    }
  }

  function loadPersistedLogs() {
    try {
      const raw = sessionStorage.getItem('cbf_session_logs');
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.slice(0, 35) : [];
    } catch (_e) {
      return [];
    }
  }

  function savePersistedLogs(logsArr) {
    try {
      sessionStorage.setItem('cbf_session_logs', JSON.stringify(logsArr.slice(0, 35)));
    } catch (_e) {
      // Ignore storage errors
    }
  }

  const initialRefreshSec = loadInitialRefreshInterval();

  const state = {
    theme: localStorage.getItem('cbf_theme') || 'light',
    collapsed: false,
    status: 'READY',
    detectedCount: 0,
    pokeBackCount: 0,
    newPokeCount: 0,
    pokedSessionCount: loadPersistedSessionCount(),
    isProcessing: false,
    isCoolingDown: false,
    isRateLimited: false,
    cooldownRemainingSec: 0,
    cancelRequested: false,
    autoWatch: localStorage.getItem('cbf_auto_watch') !== 'false',
    autoScroll: localStorage.getItem('cbf_auto_scroll') !== 'false',
    includeSuggestedPokes: localStorage.getItem('cbf_include_suggested') !== 'false',
    autoRefreshSec: initialRefreshSec,
    refreshCountdownSec: initialRefreshSec,
    currentBatchPoked: 0,
    delayMode: localStorage.getItem('cbf_delay_mode') || 'stealth',
    lastError: null,
    logs: loadPersistedLogs()
  };

  function getDelayRange() {
    if (state.delayMode === 'fast') return [350, 650];
    if (state.delayMode === 'instant') return [35, 60];
    if (state.delayMode === 'safe') return [1100, 2200];
    return [1600, 3400];
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
    if (state.logs.length > 45) {
      state.logs.length = 45;
    }
    savePersistedLogs(state.logs);
    renderWidget();
  }

  function matchesPokeBackText(text) {
    if (!text) return false;
    const normalized = text.replace(/\s+/g, ' ').trim();
    return POKE_BACK_EXACT_PATTERNS.some((regex) => regex.test(normalized));
  }

  function matchesPokeBackAria(ariaText) {
    if (!ariaText) return false;
    const normalized = ariaText.replace(/\s+/g, ' ').trim();
    return (
      POKE_BACK_EXACT_PATTERNS.some((regex) => regex.test(normalized)) ||
      POKE_BACK_ARIA_PREFIX_PATTERNS.some((regex) => regex.test(normalized))
    );
  }

  function matchesNewPokeText(text) {
    if (!text) return false;
    const normalized = text.replace(/\s+/g, ' ').trim();
    return NEW_POKE_EXACT_PATTERNS.some((regex) => regex.test(normalized));
  }

  function matchesNewPokeAria(ariaText) {
    if (!ariaText) return false;
    const normalized = ariaText.replace(/\s+/g, ' ').trim();
    return (
      NEW_POKE_EXACT_PATTERNS.some((regex) => regex.test(normalized)) ||
      NEW_POKE_ARIA_PREFIX_PATTERNS.some((regex) => regex.test(normalized))
    );
  }

  function classifyPokeButtonType(el) {
    if (!el) return null;
    const ariaLabel = el.getAttribute('aria-label') || '';
    const textContent = el.textContent || '';

    if (matchesPokeBackAria(ariaLabel) || matchesPokeBackText(textContent)) {
      return 'POKE_BACK';
    }

    if (state.includeSuggestedPokes) {
      if (matchesNewPokeAria(ariaLabel) || matchesNewPokeText(textContent)) {
        const role = el.getAttribute('role') || '';
        const tag = el.tagName.toLowerCase();
        if (role === 'button' || tag === 'button' || el.closest('[role="button"], button')) {
          return 'NEW_POKE';
        }
      }
    }

    return null;
  }

  function isElementClickablePokeButton(el) {
    if (!el || !el.isConnected) return false;
    if (el.disabled || el.getAttribute('aria-disabled') === 'true') return false;

    const btnType = classifyPokeButtonType(el);
    if (!btnType) {
      return false;
    }

    if (el.getAttribute('data-cbf-error-skipped') === 'true') {
      return false;
    }

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
    const ariaMatch = aria.match(/^(?:colek balik|poke back|membalas colekan|balas colek|colek|poke)\s+(.+)$/i);
    if (ariaMatch && ariaMatch[1]) {
      return ariaMatch[1].trim();
    }

    let curr = buttonEl.parentElement;
    while (curr && curr !== document.body) {
      const linkOrName = curr.querySelector('[data-friend-name], a[role="link"], a[href*="facebook.com"], strong, h3, h4');
      if (linkOrName && linkOrName.textContent.trim()) {
        const candidateName = linkOrName.textContent.replace(/\s+/g, ' ').trim();
        if (
          candidateName &&
          !matchesPokeBackText(candidateName) &&
          !matchesNewPokeText(candidateName) &&
          !/^dicolek$/i.test(candidateName) &&
          !/^colekan$/i.test(candidateName) &&
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

  // Locate the row container for a poke button so we can verify after clicking whether Facebook reverted it back to blue!
  function findFriendRowContainer(btnEl) {
    if (!btnEl) return null;
    return btnEl.closest('[data-poke-row], [role="article"], [role="listitem"], .poke-card, .poke-row, li');
  }

  // Check if a clicked button (or a newly re-rendered button inside the same friend row / for the same friend name)
  // is STILL or REVERTED back to active blue "Colek balik" / "Colek" right after being clicked!
  function didPokeSnapBackToBlue(clickedBtn, rowContainer, friendName) {
    // Explicit simulation attribute for testing fast snap-back rate-limit detection
    if (clickedBtn && clickedBtn.getAttribute('data-simulate-snapback') === 'true') {
      return true;
    }

    // 1. If the exact same DOM button element is still connected, enabled, and still has a poke label ("Colek balik" / "Colek")
    if (
      clickedBtn &&
      clickedBtn.isConnected &&
      !clickedBtn.disabled &&
      clickedBtn.getAttribute('aria-disabled') !== 'true' &&
      classifyPokeButtonType(clickedBtn) !== null
    ) {
      return true;
    }

    // 2. If Facebook re-rendered a new button node inside the same friend row container that is still active blue "Colek balik" / "Colek"
    if (rowContainer && rowContainer.isConnected) {
      const candidates = rowContainer.querySelectorAll('div[role="button"], span[role="button"], a[role="button"], button, [aria-label]');
      for (const el of candidates) {
        const root = findInteractiveButtonAncestor(el) || el;
        if (
          root &&
          !root.disabled &&
          root.getAttribute('aria-disabled') !== 'true' &&
          classifyPokeButtonType(root) !== null
        ) {
          return true;
        }
      }
    }

    // 3. Fallback search by friend name across the current DOM
    if (friendName && !friendName.startsWith('Teman #')) {
      const allActive = findPokeBackButtons();
      for (const activeBtn of allActive) {
        const name = extractTargetName(activeBtn, 0);
        if (name && name.toLowerCase() === friendName.toLowerCase()) {
          return true;
        }
      }
    }

    return false;
  }

  // Immediately emergency-stop all auto-poking & auto-refresh when a fast snap-back to blue is detected!
  function triggerRateLimitEmergencyStop(friendName, detailReason) {
    state.cancelRequested = true;
    state.isProcessing = false;
    state.isCoolingDown = false;
    state.isRateLimited = true;
    state.autoWatch = false;
    localStorage.setItem('cbf_auto_watch', 'false');
    state.status = 'RATE_LIMITED';
    state.lastError =
      detailReason ||
      `Tombol "${friendName}" mental kembali ke biru ("Colek balik") sangat cepat! Akun terkena batasan (limit) Facebook. Auto-Colek & Auto-Refresh DIHENTIKAN OTOMATIS agar akun aman.`;
    addLog(`[BATAS FACEBOOK TERDETEKSI] ${state.lastError}`);
    renderWidget();
  }

  function findPokeBackButtons() {
    const candidates = Array.from(
      document.querySelectorAll(
        'div[role="button"], span[role="button"], a[role="button"], button, [aria-label], span'
      )
    );

    const pokeBackList = [];
    const newPokeList = [];
    const seen = new Set();

    for (const el of candidates) {
      if (el.closest('#cbf-floating-widget') || el.closest('#sandbox-control-bar')) {
        continue;
      }

      const ariaLabel = el.getAttribute('aria-label') || '';
      const directText = el.childElementCount === 0 ? el.textContent || '' : '';

      const isBack = matchesPokeBackAria(ariaLabel) || matchesPokeBackText(directText);
      const isNew =
        !isBack &&
        state.includeSuggestedPokes &&
        (matchesNewPokeAria(ariaLabel) || matchesNewPokeText(directText));

      if (isBack || isNew) {
        const interactiveRoot = findInteractiveButtonAncestor(el) || el;
        if (!seen.has(interactiveRoot) && isElementClickablePokeButton(interactiveRoot)) {
          seen.add(interactiveRoot);
          if (classifyPokeButtonType(interactiveRoot) === 'POKE_BACK') {
            pokeBackList.push(interactiveRoot);
          } else {
            newPokeList.push(interactiveRoot);
          }
        }
      }
    }

    state.pokeBackCount = pokeBackList.length;
    state.newPokeCount = newPokeList.length;
    return [...pokeBackList, ...newPokeList];
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

  function detectFacebookRateLimitWarning() {
    const dialogs = document.querySelectorAll('[role="dialog"], [role="alert"], [aria-live="assertive"]');
    for (const d of dialogs) {
      const txt = (d.textContent || '').toLowerCase();
      if (
        txt.includes('terlalu cepat') ||
        txt.includes('diblokir sementara') ||
        txt.includes('coba lagi nanti') ||
        txt.includes('you’re going too fast') ||
        txt.includes("you're going too fast") ||
        txt.includes('temporarily blocked') ||
        txt.includes('try again later')
      ) {
        return true;
      }
    }
    return false;
  }

  async function triggerHumanizedReactClick(targetEl) {
    const rect = targetEl.getBoundingClientRect();
    const jitterX = (Math.random() - 0.5) * Math.max(6, rect.width * 0.45);
    const jitterY = (Math.random() - 0.5) * Math.max(4, rect.height * 0.45);
    const clientX = Math.round(rect.left + rect.width / 2 + jitterX);
    const clientY = Math.round(rect.top + rect.height / 2 + jitterY);

    if (
      window.AndroidBridge &&
      typeof window.AndroidBridge.performTrustedTap === 'function' &&
      state.delayMode !== 'instant'
    ) {
      try {
        const dpr = window.devicePixelRatio || 1;
        window.AndroidBridge.performTrustedTap(Math.round(clientX * dpr), Math.round(clientY * dpr));
        await sleep(randomBetween(70, 140));
        return;
      } catch (_e) {
        // Fallback to JS event dispatch
      }
    }

    const hitTarget = document.elementFromPoint(clientX, clientY);
    const dispatchEl =
      hitTarget && targetEl.contains(hitTarget) ? hitTarget : targetEl;

    try {
      if (typeof targetEl.focus === 'function') {
        targetEl.focus({ preventScroll: true });
      }
    } catch (_e) {
      // Ignore focus errors
    }

    const commonInit = {
      bubbles: true,
      cancelable: true,
      composed: true,
      view: window,
      clientX,
      clientY,
      screenX: clientX + randomBetween(0, 15),
      screenY: clientY + randomBetween(40, 80),
      button: 0,
      buttons: 1
    };

    if (typeof PointerEvent === 'function') {
      dispatchEl.dispatchEvent(
        new PointerEvent('pointerover', { ...commonInit, pointerId: 1, pointerType: 'touch', isPrimary: true })
      );
      dispatchEl.dispatchEvent(
        new PointerEvent('pointerenter', { ...commonInit, bubbles: false, pointerId: 1, pointerType: 'touch', isPrimary: true })
      );
      dispatchEl.dispatchEvent(
        new PointerEvent('pointerdown', { ...commonInit, pointerId: 1, pointerType: 'touch', isPrimary: true, pressure: 0.6 })
      );
    }

    dispatchEl.dispatchEvent(new MouseEvent('mouseover', commonInit));
    dispatchEl.dispatchEvent(new MouseEvent('mousedown', commonInit));

    if (state.delayMode !== 'instant') {
      await sleep(randomBetween(45, 120));
    }

    if (typeof PointerEvent === 'function') {
      dispatchEl.dispatchEvent(
        new PointerEvent('pointerup', {
          ...commonInit,
          buttons: 0,
          pointerId: 1,
          pointerType: 'touch',
          isPrimary: true,
          pressure: 0
        })
      );
    }

    dispatchEl.dispatchEvent(new MouseEvent('mouseup', { ...commonInit, buttons: 0 }));
    dispatchEl.dispatchEvent(new MouseEvent('click', { ...commonInit, buttons: 0, detail: 1 }));
  }

  async function runCooldownTimer(seconds, reasonText) {
    state.isCoolingDown = true;
    state.status = 'COOLDOWN';
    addLog(`${reasonText} (${seconds} detik)...`);
    for (let rem = seconds; rem > 0; rem -= 1) {
      if (state.cancelRequested) break;
      state.cooldownRemainingSec = rem;
      renderWidget();
      await sleep(1000);
    }
    state.isCoolingDown = false;
    state.cooldownRemainingSec = 0;
  }

  async function tryLoadMorePokesFromPage() {
    if (!state.autoScroll || state.isRateLimited) return false;

    const seeMoreBtn = findSeeMoreButton();
    if (seeMoreBtn) {
      addLog('Menekan "Lihat Lainnya" untuk membuka daftar teman yang belum terkena colek...');
      seeMoreBtn.scrollIntoView({ block: 'center', behavior: state.delayMode === 'instant' ? 'instant' : 'smooth' });
      await sleep(state.delayMode === 'instant' ? 40 : 180);
      await triggerHumanizedReactClick(seeMoreBtn);
      const waitLoad = state.delayMode === 'instant' ? 80 : 1200;
      await sleep(waitLoad);
      if (findPokeBackButtons().length > 0) return true;
    }

    const prevScrollY = window.scrollY;
    const maxScroll = Math.max(
      document.documentElement.scrollHeight,
      document.body ? document.body.scrollHeight : 0
    );

    if (window.innerHeight + window.scrollY < maxScroll - 10) {
      addLog('Menggulir halaman ke bawah untuk mencari teman lain yang belum terkena colek...');
      window.scrollTo({
        top: Math.min(maxScroll, window.scrollY + Math.round(window.innerHeight * 0.85)),
        behavior: state.delayMode === 'instant' ? 'instant' : 'smooth'
      });
      const waitScroll = state.delayMode === 'instant' ? 80 : 1000;
      await sleep(waitScroll);
      if (findPokeBackButtons().length > 0 || window.scrollY > prevScrollY) {
        return findPokeBackButtons().length > 0;
      }
    }

    return false;
  }

  async function findAndPokeMoreFriendsNow() {
    state.isRateLimited = false;
    if (!state.includeSuggestedPokes) {
      state.includeSuggestedPokes = true;
      localStorage.setItem('cbf_include_suggested', 'true');
    }

    addLog('Mencari tambahan teman (Saran Colekan & daftar bawah) yang belum terkena colek...');

    if (typeof window.__CBF_LOAD_MORE_UNPOKED_FRIENDS__ === 'function') {
      try {
        window.__CBF_LOAD_MORE_UNPOKED_FRIENDS__();
      } catch (_e) {
        // Ignore
      }
    }

    await tryLoadMorePokesFromPage();
    const found = findPokeBackButtons();
    state.detectedCount = found.length;
    renderWidget();

    if (found.length > 0 && !state.isProcessing) {
      return executeOneClickPokeAll(false);
    }
    return {
      ok: true,
      status: state.status,
      clickedCount: 0,
      failedCount: 0,
      remainingCount: found.length
    };
  }

  function executeAutoRefreshNow(reason = 'Memuat ulang daftar colekan secara otomatis...') {
    if (state.isProcessing || state.isCoolingDown || state.isRateLimited) {
      state.refreshCountdownSec = state.autoRefreshSec || 25;
      return false;
    }

    const pendingNow = findPokeBackButtons();
    if (pendingNow.length > 0 && state.autoWatch) {
      state.refreshCountdownSec = state.autoRefreshSec || 25;
      executeOneClickPokeAll(true);
      return false;
    }

    addLog(reason);
    state.refreshCountdownSec = state.autoRefreshSec || 25;

    if (typeof window.__CBF_ON_AUTO_REFRESH__ === 'function') {
      try {
        window.__CBF_ON_AUTO_REFRESH__();
        scanPage(false);
        return true;
      } catch (_e) {
        // Fallback below
      }
    }

    const simIncomingBtn = document.getElementById('apk-simulate-incoming-btn');
    if (simIncomingBtn && simIncomingBtn.offsetParent !== null) {
      simIncomingBtn.click();
      return true;
    }

    const fbPokesLink = document.querySelector('a[href="/pokes"], a[href="/pokes/"], a[href*="facebook.com/pokes"]');
    if (fbPokesLink && !fbPokesLink.closest('#cbf-floating-widget')) {
      try {
        window.scrollTo({ top: 0, behavior: 'instant' });
        triggerHumanizedReactClick(fbPokesLink);
        return true;
      } catch (_e) {
        // Fallback to native/window reload
      }
    }

    if (window.AndroidBridge && typeof window.AndroidBridge.reloadPokesPage === 'function') {
      window.AndroidBridge.reloadPokesPage();
      return true;
    }

    window.location.reload();
    return true;
  }

  function cycleAutoRefreshInterval() {
    const curIdx = AUTO_REFRESH_OPTIONS.indexOf(state.autoRefreshSec);
    const nextIdx = (curIdx + 1) % AUTO_REFRESH_OPTIONS.length;
    state.autoRefreshSec = AUTO_REFRESH_OPTIONS[nextIdx];
    state.refreshCountdownSec = state.autoRefreshSec;
    localStorage.setItem('cbf_auto_refresh_sec', String(state.autoRefreshSec));

    if (state.autoRefreshSec > 0) {
      addLog(`Auto-Refresh diatur setiap ${state.autoRefreshSec} detik saat daftar colekan kosong.`);
    } else {
      addLog('Auto-Refresh halaman DIMATIKAN.');
    }
    renderWidget();
    return state.autoRefreshSec;
  }

  function toggleIncludeSuggestedPokes() {
    state.includeSuggestedPokes = !state.includeSuggestedPokes;
    localStorage.setItem('cbf_include_suggested', String(state.includeSuggestedPokes));
    if (state.includeSuggestedPokes) {
      addLog('Mode Tambah Colekan Teman Baru ("Colek" / Saran Teman) DIAKTIFKAN.');
    } else {
      addLog('Mode Tambah Colekan Teman Baru DIMATIKAN (hanya membalas "Colek balik").');
    }
    scanPage(false);
    return state.includeSuggestedPokes;
  }

  function scanPage(logResult = false) {
    if (state.isProcessing) return findPokeBackButtons();
    if (state.isRateLimited) {
      const buttons = findPokeBackButtons();
      state.detectedCount = buttons.length;
      renderWidget();
      return buttons;
    }
    try {
      state.lastError = null;
      const buttons = findPokeBackButtons();
      state.detectedCount = buttons.length;

      if (buttons.length === 0) {
        state.status = state.autoWatch ? 'WATCHING' : 'EMPTY';
        if (logResult) {
          addLog(
            state.autoWatch
              ? 'Pemindaian selesai: 0 tombol Colek di layar. Tekan "Cari & Colek Teman Lain" untuk menggulir & mencari teman.'
              : 'Pemindaian selesai: 0 tombol Colek ditemukan.'
          );
        }
      } else {
        state.status = 'READY';
        state.refreshCountdownSec = state.autoRefreshSec;
        if (logResult) {
          addLog(
            `Pemindaian selesai: ${state.pokeBackCount} Colek Balik + ${state.newPokeCount} Teman Belum Tercolek siap dieksekusi.`
          );
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
    // If user manually clicks the main button while rate-limited, reset the lock so they can test if the limit expired
    if (!triggeredByWatcher && state.isRateLimited) {
      state.isRateLimited = false;
      state.lastError = null;
      friendLastClickTimeMap.clear();
    }

    if (state.isRateLimited) {
      return {
        ok: false,
        status: 'RATE_LIMITED',
        clickedCount: 0,
        failedCount: 1,
        remainingCount: state.detectedCount
      };
    }

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
      const loadedMore = await tryLoadMorePokesFromPage();
      if (loadedMore) {
        availableButtons = findPokeBackButtons();
        state.detectedCount = availableButtons.length;
      }
    }

    if (availableButtons.length === 0) {
      state.status = state.autoWatch ? 'WATCHING' : 'EMPTY';
      if (!triggeredByWatcher) {
        addLog('Tidak ada tombol Colek Balik maupun Saran Teman di layar saat ini.');
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
    state.refreshCountdownSec = state.autoRefreshSec;
    renderWidget();

    const [minDelay, maxDelay] = getDelayRange();
    if (!triggeredByWatcher) {
      addLog(
        `Mode ${state.delayMode.toUpperCase()}: mencolek ${state.pokeBackCount} Colek Balik & ${state.newPokeCount} Teman Baru...`
      );
    } else {
      addLog(
        `Terdeteksi ${state.pokeBackCount} Colek Balik + ${state.newPokeCount} Teman Belum Tercolek! Memproses otomatis...`
      );
    }

    let clickedCount = 0;
    let failedCount = 0;
    const clickedNames = [];
    let scrollAttemptsWithoutNew = 0;

    while (!state.cancelRequested) {
      if (detectFacebookRateLimitWarning()) {
        triggerRateLimitEmergencyStop(
          'Dialog Peringatan Facebook',
          'Terdeteksi pop-up peringatan batas kecepatan Facebook! Auto-Colek DIHENTIKAN OTOMATIS.'
        );
        return {
          ok: false,
          status: 'RATE_LIMITED',
          clickedCount,
          failedCount: failedCount + 1,
          remainingCount: findPokeBackButtons().length
        };
      }

      const liveButtons = findPokeBackButtons();
      state.detectedCount = liveButtons.length;

      if (liveButtons.length === 0) {
        if (state.autoScroll && scrollAttemptsWithoutNew < 3) {
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

      const pickIndex =
        liveButtons.length > 1 && state.delayMode === 'stealth' && Math.random() < 0.2 ? 1 : 0;
      const btn = liveButtons[pickIndex];
      const btnType = classifyPokeButtonType(btn);
      const friendName = extractTargetName(btn, clickedCount);
      const rowContainer = findFriendRowContainer(btn);

      // Guard 1: Check if this exact same friend was already clicked < 3.5 seconds ago and already turned blue again!
      const prevFriendClickTs = friendLastClickTimeMap.get(friendName) || 0;
      const snapWindow = state.delayMode === 'instant' ? 0 : FAST_SNAPBACK_WINDOW_MS;
      if (snapWindow > 0 && Date.now() - prevFriendClickTs < snapWindow) {
        triggerRateLimitEmergencyStop(
          friendName,
          `Tombol "${friendName}" kembali jadi biru sangat cepat (<3.5 detik)! Tandanya akun terkena batasan (limit) Facebook. Auto-Colek BERHENTI OTOMATIS.`
        );
        return {
          ok: false,
          status: 'RATE_LIMITED',
          clickedCount,
          failedCount: failedCount + 1,
          remainingCount: findPokeBackButtons().length
        };
      }

      try {
        if (btn.getAttribute('data-simulate-error') === 'true') {
          btn.setAttribute('data-cbf-error-skipped', 'true');
          throw new Error(`Tombol untuk ${friendName} menolak interaksi klik.`);
        }

        const rect = btn.getBoundingClientRect();
        if (rect.top < 40 || rect.bottom > window.innerHeight - 40) {
          btn.scrollIntoView({
            block: 'center',
            behavior: state.delayMode === 'instant' ? 'instant' : 'smooth'
          });
          await sleep(state.delayMode === 'instant' ? 35 : randomBetween(180, 360));
        }

        const clickNowTs = Date.now();
        recentClickTimestamps.set(btn, clickNowTs);
        friendLastClickTimeMap.set(friendName, clickNowTs);

        await triggerHumanizedReactClick(btn);

        // Guard 2: Post-Click Fast Snap-Back Verification!
        // When Facebook rate-limits an account, the button optimistically flickers to "Dicolek" for ~200-700ms,
        // and then the GraphQL error response reverts it right back to blue "Colek balik" / "Colek".
        // We inspect the button/row after the GraphQL round-trip window to verify it truly stayed "Dicolek"!
        const verifyWaitMs = state.delayMode === 'instant' ? 45 : 850;
        await sleep(verifyWaitMs);

        if (didPokeSnapBackToBlue(btn, rowContainer, friendName)) {
          triggerRateLimitEmergencyStop(
            friendName,
            `Tombol "${friendName}" mental kembali ke biru ("Colek balik") dengan sangat cepat! Tandanya akun terkena batasan (limit) Facebook. Auto-Colek BERHENTI OTOMATIS.`
          );
          return {
            ok: false,
            status: 'RATE_LIMITED',
            clickedCount,
            failedCount: failedCount + 1,
            remainingCount: findPokeBackButtons().length
          };
        }

        clickedCount += 1;
        state.currentBatchPoked = clickedCount;
        state.pokedSessionCount += 1;
        savePersistedSessionCount(state.pokedSessionCount);
        clickedNames.push(friendName);
        state.detectedCount = Math.max(0, liveButtons.length - 1);
        state.status = 'LOADING';
        state.refreshCountdownSec = state.autoRefreshSec;
        const actionVerb = btnType === 'NEW_POKE' ? 'Mencolek teman baru' : 'Mencolek balik';
        addLog(`(#${state.pokedSessionCount}) ${actionVerb}: ${friendName}`);
      } catch (err) {
        failedCount += 1;
        state.lastError = err && err.message ? err.message : `Gagal mencolek ${friendName}`;
        addLog(`Galat pada ${friendName}: ${state.lastError}`);
      }

      renderWidget();

      if (state.cancelRequested || state.isRateLimited) break;

      if (state.delayMode === 'stealth') {
        if (clickedCount > 0 && clickedCount % 40 === 0 && findPokeBackButtons().length > 0) {
          await runCooldownTimer(
            35,
            `Sudah ${clickedCount} colekan beruntun. Istirahat anti-limit Facebook`
          );
          continue;
        } else if (clickedCount > 0 && clickedCount % 14 === 0 && findPokeBackButtons().length > 0) {
          await runCooldownTimer(
            randomBetween(7, 12),
            `Jeda napas manusiawi setelah ${clickedCount} colekan`
          );
          continue;
        }
      } else if (state.delayMode === 'safe') {
        if (clickedCount > 0 && clickedCount % 25 === 0 && findPokeBackButtons().length > 0) {
          await runCooldownTimer(
            randomBetween(8, 14),
            `Jeda pengaman setelah ${clickedCount} colekan`
          );
          continue;
        }
      }

      const [curMin, curMax] = getDelayRange();
      // Subtract verifyWaitMs so total pacing remains smooth
      const remainingDelay = Math.max(20, randomBetween(curMin, curMax) - (state.delayMode === 'instant' ? 0 : 850));
      await sleep(remainingDelay);
    }

    state.isProcessing = false;
    state.isCoolingDown = false;
    state.cancelRequested = false;
    state.refreshCountdownSec = state.autoRefreshSec;

    if (state.isRateLimited) {
      renderWidget();
      return {
        ok: false,
        status: 'RATE_LIMITED',
        clickedCount,
        failedCount: failedCount + 1,
        remainingCount: findPokeBackButtons().length
      };
    }

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
        const refreshNote =
          state.autoRefreshSec > 0
            ? ` Auto-Refresh & Cari Teman dalam ${state.refreshCountdownSec}d.`
            : '';
        addLog(`Terbalas/Tercolek ${clickedCount} teman (${summaryNames}${suffix}).${refreshNote}`);
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
      case 'RATE_LIMITED':
        return {
          badgeText: '[KENA LIMIT - BERHENTI]',
          badgeState: 'error',
          message:
            state.lastError ||
            'Tombol Colek kembali ke biru dengan sangat cepat! Akun terkena batasan Facebook. Auto-Colek & Auto-Refresh dihentikan otomatis.'
        };
      case 'COOLDOWN':
        return {
          badgeText: `[JEDA ANTI-LIMIT ${state.cooldownRemainingSec}d]`,
          badgeState: 'normal',
          message: `Istirahat otomatis ${state.cooldownRemainingSec} detik agar akun tidak kena limit 100 colekan Facebook. Setelah ini lanjut mencolek otomatis...`
        };
      case 'LOADING':
        return {
          badgeText: '[MEMPROSES]',
          badgeState: 'normal',
          message: `Sedang mencolek otomatis (Tercolek: ${state.currentBatchPoked} | Balik: ${state.pokeBackCount} | Teman Baru: ${state.newPokeCount})...`
        };
      case 'WATCHING': {
        const refreshTag =
          state.autoRefreshSec > 0
            ? ` Auto-Cari & Refresh dalam ${state.refreshCountdownSec}d.`
            : ' Auto-Refresh mati.';
        return {
          badgeText:
            state.autoRefreshSec > 0
              ? `[AUTO-COLEK | REFRESH ${state.refreshCountdownSec}d]`
              : '[AUTO-COLEK AKTIF]',
          badgeState: 'success',
          message: `Siaga penuh (Sensor Limit Snap-Back aktif)!${refreshTag} Total sesi: ${state.pokedSessionCount}.`
        };
      }
      case 'DONE':
        return {
          badgeText: '[SELESAI]',
          badgeState: 'success',
          message: `Semua colekan & saran teman di layar sudah dicolek. Total sesi ini: ${state.pokedSessionCount} teman.`
        };
      case 'EMPTY':
        return {
          badgeText: '[KOSONG]',
          badgeState: 'normal',
          message: 'Belum ada tombol "Colek Balik" atau "Colek" di layar. Tekan "Cari & Colek Teman Lain" untuk memuat daftar teman.'
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
          message: `Siap mencolek: ${state.pokeBackCount} Colek Balik + ${state.newPokeCount} Teman Belum Tercolek.`
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
          <h2 class="cbf-title">Colek Balik &amp; Tambah Colekan</h2>
          <p class="cbf-subtitle">Auto-Stop Saat Kena Batas Limit</p>
        </div>
        <div class="cbf-header-controls">
          <button type="button" id="cbf-speed-btn" class="cbf-icon-btn" aria-label="Ubah mode jeda anti-limit">
            Jeda: Anti-Limit
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
          <span id="cbf-counters" class="cbf-counters">Siap: 0 | Tercolek: 0</span>
        </div>
        <p id="cbf-state-msg" class="cbf-state-message" role="status" aria-live="polite"></p>
        <div class="cbf-actions">
          <button type="button" id="cbf-poke-all-btn" class="cbf-primary-btn">
            Colek Semua Sekarang (0)
          </button>
          <div class="cbf-secondary-row">
            <button type="button" id="cbf-find-more-friends-btn" class="cbf-secondary-btn">
              + Cari &amp; Colek Teman Lain
            </button>
            <button type="button" id="cbf-suggested-toggle-btn" class="cbf-secondary-btn" aria-pressed="true">
              Saran Teman: ON
            </button>
          </div>
          <div class="cbf-secondary-row">
            <button type="button" id="cbf-autowatch-btn" class="cbf-secondary-btn" aria-pressed="true">
              Auto-Pantau: AKTIF
            </button>
            <button type="button" id="cbf-autorefresh-btn" class="cbf-secondary-btn" aria-pressed="true">
              Auto-Refresh: 25d
            </button>
          </div>
          <div class="cbf-secondary-row">
            <button type="button" id="cbf-rescan-btn" class="cbf-secondary-btn">
              Refresh Sekarang
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
      document.querySelectorAll('[data-cbf-error-skipped]').forEach((el) => {
        el.removeAttribute('data-cbf-error-skipped');
      });
      state.isRateLimited = false;
      executeOneClickPokeAll(false);
    });

    document.getElementById('cbf-find-more-friends-btn').addEventListener('click', () => {
      findAndPokeMoreFriendsNow();
    });

    document.getElementById('cbf-suggested-toggle-btn').addEventListener('click', () => {
      toggleIncludeSuggestedPokes();
    });

    document.getElementById('cbf-autowatch-btn').addEventListener('click', () => {
      state.autoWatch = !state.autoWatch;
      localStorage.setItem('cbf_auto_watch', String(state.autoWatch));
      if (state.autoWatch) {
        state.isRateLimited = false;
        state.lastError = null;
        friendLastClickTimeMap.clear();
        state.refreshCountdownSec = state.autoRefreshSec;
        addLog('Auto-Pantau DIAKTIFKAN: otomatis membalas & berhenti jika tombol mental kembali ke biru.');
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

    document.getElementById('cbf-autorefresh-btn').addEventListener('click', () => {
      cycleAutoRefreshInterval();
    });

    document.getElementById('cbf-rescan-btn').addEventListener('click', () => {
      state.isRateLimited = false;
      const found = scanPage(true);
      if (found.length === 0) {
        executeAutoRefreshNow('Memuat ulang halaman untuk mencari colekan terbaru...');
      }
    });

    document.getElementById('cbf-clear-log-btn').addEventListener('click', () => {
      state.logs = [];
      savePersistedLogs(state.logs);
      addLog('Catatan log dibersihkan.');
    });

    document.getElementById('cbf-speed-btn').addEventListener('click', () => {
      if (state.delayMode === 'stealth') {
        state.delayMode = 'safe';
      } else if (state.delayMode === 'safe') {
        state.delayMode = 'fast';
      } else if (state.delayMode === 'fast') {
        state.delayMode = 'instant';
      } else {
        state.delayMode = 'stealth';
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

  function notifyNativeAndroidDock() {
    if (
      window.AndroidBridge &&
      typeof window.AndroidBridge.onStateUpdated === 'function'
    ) {
      const meta = getStatusMeta();
      const topLog = state.logs.length > 0 ? state.logs[0] : 'Siap memantau halaman Colekan Facebook.';
      try {
        window.AndroidBridge.onStateUpdated(
          meta.badgeText,
          state.detectedCount,
          state.pokedSessionCount,
          state.autoWatch,
          state.isProcessing,
          state.delayMode,
          topLog,
          state.autoRefreshSec,
          state.refreshCountdownSec,
          state.includeSuggestedPokes,
          state.pokeBackCount,
          state.newPokeCount
        );
      } catch (_e) {
        try {
          window.AndroidBridge.onStateUpdated(
            meta.badgeText,
            state.detectedCount,
            state.pokedSessionCount,
            state.autoWatch,
            state.isProcessing,
            state.delayMode,
            topLog,
            state.autoRefreshSec,
            state.refreshCountdownSec
          );
        } catch (_e2) {
          // Ignore
        }
      }
    }
  }

  function renderWidget() {
    notifyNativeAndroidDock();

    const isNativeAndroidApp =
      Boolean(window.__CBF_NATIVE_ANDROID_DOCK__) ||
      Boolean(window.AndroidBridge && typeof window.AndroidBridge.onStateUpdated === 'function');

    const widget = buildWidgetDOM();
    if (isNativeAndroidApp) {
      widget.style.display = 'none';
      return;
    }
    widget.style.display = '';
    widget.setAttribute('data-theme', state.theme);
    widget.setAttribute('data-collapsed', String(state.collapsed));

    const speedBtn = document.getElementById('cbf-speed-btn');
    if (speedBtn) {
      const labelMap = {
        stealth: 'Jeda: Anti-Limit',
        safe: 'Jeda: Aman',
        fast: 'Jeda: Cepat',
        instant: 'Jeda: Instan'
      };
      speedBtn.textContent = labelMap[state.delayMode] || 'Jeda: Anti-Limit';
    }

    const suggestedBtn = document.getElementById('cbf-suggested-toggle-btn');
    if (suggestedBtn) {
      suggestedBtn.textContent = state.includeSuggestedPokes
        ? `Saran Teman: ON (${state.newPokeCount})`
        : 'Saran Teman: OFF';
      suggestedBtn.setAttribute('aria-pressed', String(state.includeSuggestedPokes));
      suggestedBtn.setAttribute('data-active', String(state.includeSuggestedPokes));
    }

    const autoWatchBtn = document.getElementById('cbf-autowatch-btn');
    if (autoWatchBtn) {
      autoWatchBtn.textContent = state.autoWatch ? 'Auto-Pantau: AKTIF' : 'Auto-Pantau: MATI';
      autoWatchBtn.setAttribute('aria-pressed', String(state.autoWatch));
      autoWatchBtn.setAttribute('data-active', String(state.autoWatch));
    }

    const autoRefreshBtn = document.getElementById('cbf-autorefresh-btn');
    if (autoRefreshBtn) {
      if (state.autoRefreshSec > 0) {
        autoRefreshBtn.textContent = `Auto-Refresh: ${state.refreshCountdownSec}d/${state.autoRefreshSec}d`;
        autoRefreshBtn.setAttribute('aria-pressed', 'true');
        autoRefreshBtn.setAttribute('data-active', 'true');
      } else {
        autoRefreshBtn.textContent = 'Auto-Refresh: MATI';
        autoRefreshBtn.setAttribute('aria-pressed', 'false');
        autoRefreshBtn.setAttribute('data-active', 'false');
      }
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
      countersEl.textContent = `Siap: ${state.detectedCount} (Balik:${state.pokeBackCount} | Baru:${state.newPokeCount}) | Tercolek: ${state.pokedSessionCount}`;
    }

    const msgEl = document.getElementById('cbf-state-msg');
    if (msgEl) {
      msgEl.textContent = meta.message;
      msgEl.setAttribute('data-state', meta.badgeState);
    }

    const primaryBtn = document.getElementById('cbf-poke-all-btn');
    if (primaryBtn) {
      if (state.isRateLimited) {
        primaryBtn.textContent = `Kena Limit FB (Klik untuk Coba Lagi)`;
      } else if (state.isProcessing) {
        primaryBtn.textContent = state.isCoolingDown
          ? `Jeda Anti-Limit (${state.cooldownRemainingSec}d) - Klik untuk Batal`
          : `Hentikan Proses (Tercolek: ${state.currentBatchPoked})`;
      } else {
        primaryBtn.textContent = `Colek Semua Sekarang (${state.detectedCount})`;
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
    notifyNativeDock: () => notifyNativeAndroidDock(),
    findAndPokeMoreFriends: () => findAndPokeMoreFriendsNow(),
    toggleSuggestedPokes: () => toggleIncludeSuggestedPokes(),
    cycleAutoRefresh: () => cycleAutoRefreshInterval(),
    setAutoRefreshSec: (sec) => {
      const parsed = parseInt(sec, 10);
      state.autoRefreshSec = Number.isNaN(parsed) || parsed < 0 ? 0 : parsed;
      state.refreshCountdownSec = state.autoRefreshSec;
      localStorage.setItem('cbf_auto_refresh_sec', String(state.autoRefreshSec));
      renderWidget();
    },
    triggerAutoRefreshNow: () => executeAutoRefreshNow('Refresh otomatis dipicu...'),
    pokeAll: () => {
      document.querySelectorAll('[data-cbf-error-skipped]').forEach((el) => {
        el.removeAttribute('data-cbf-error-skipped');
      });
      state.isRateLimited = false;
      friendLastClickTimeMap.clear();
      return executeOneClickPokeAll(false);
    },
    setAutoWatch: (enabled) => {
      state.autoWatch = Boolean(enabled);
      localStorage.setItem('cbf_auto_watch', String(state.autoWatch));
      if (state.autoWatch) {
        state.isRateLimited = false;
        state.lastError = null;
        friendLastClickTimeMap.clear();
      }
      state.refreshCountdownSec = state.autoRefreshSec;
      if (state.autoWatch && !state.isProcessing && findPokeBackButtons().length > 0) {
        executeOneClickPokeAll(true);
      } else {
        scanPage(false);
      }
    },
    setDelayMode: (mode) => {
      if (mode === 'stealth' || mode === 'safe' || mode === 'fast' || mode === 'instant') {
        state.delayMode = mode;
        localStorage.setItem('cbf_delay_mode', mode);
        renderWidget();
      }
    },
    getState: () => ({
      status: state.status,
      isProcessing: state.isProcessing,
      isCoolingDown: state.isCoolingDown,
      isRateLimited: state.isRateLimited,
      cooldownRemainingSec: state.cooldownRemainingSec,
      autoWatch: state.autoWatch,
      includeSuggestedPokes: state.includeSuggestedPokes,
      pokeBackCount: state.pokeBackCount,
      newPokeCount: state.newPokeCount,
      autoRefreshSec: state.autoRefreshSec,
      refreshCountdownSec: state.refreshCountdownSec,
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
        state.isRateLimited = false;
        scanPage(true);
        sendResponse(window.CBFController.getState());
        return false;
      }
      if (request.action === 'CBF_FIND_MORE_FRIENDS') {
        findAndPokeMoreFriendsNow().then((result) => {
          sendResponse({ ...window.CBFController.getState(), result });
        });
        return true;
      }
      if (request.action === 'CBF_TOGGLE_AUTOWATCH') {
        window.CBFController.setAutoWatch(!state.autoWatch);
        sendResponse(window.CBFController.getState());
        return false;
      }
      if (request.action === 'CBF_CYCLE_AUTOREFRESH') {
        cycleAutoRefreshInterval();
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
    if (state.isProcessing || state.isRateLimited) return;
    const buttons = findPokeBackButtons();
    state.detectedCount = buttons.length;

    if (buttons.length > 0) {
      state.refreshCountdownSec = state.autoRefreshSec;
      if (state.autoWatch) {
        executeOneClickPokeAll(true);
        return;
      }
    }

    if (state.status !== 'DONE' && state.status !== 'ERROR' && state.status !== 'RATE_LIMITED') {
      state.status = state.autoWatch ? 'WATCHING' : buttons.length > 0 ? 'READY' : 'EMPTY';
    }
    renderWidget();
  }

  const observer = new MutationObserver((mutations) => {
    if (state.isProcessing || state.isRateLimited) return;
    const shouldRescan = mutations.some((m) => {
      const targetNode = m.target && m.target.nodeType === 1 ? m.target : m.target && m.target.parentElement;
      if (targetNode && targetNode.closest && targetNode.closest('#cbf-floating-widget')) {
        return false;
      }
      return true;
    });

    if (shouldRescan) {
      clearTimeout(scanTimeout);
      scanTimeout = setTimeout(handlePotentialNewPokes, 180);
    }
  });

  setInterval(() => {
    if (state.isProcessing || state.isCoolingDown || state.isRateLimited) {
      state.refreshCountdownSec = state.autoRefreshSec;
      return;
    }

    const pending = findPokeBackButtons();
    if (pending.length !== state.detectedCount) {
      state.detectedCount = pending.length;
    }

    if (pending.length > 0) {
      state.refreshCountdownSec = state.autoRefreshSec;
      if (state.autoWatch) {
        executeOneClickPokeAll(true);
        return;
      }
      renderWidget();
      return;
    }

    if (state.autoWatch && state.autoRefreshSec > 0) {
      state.status = 'WATCHING';
      state.refreshCountdownSec = Math.max(0, state.refreshCountdownSec - 1);
      renderWidget();

      if (state.autoScroll && state.refreshCountdownSec === Math.floor(state.autoRefreshSec / 2)) {
        tryLoadMorePokesFromPage();
      }

      if (state.refreshCountdownSec <= 0) {
        state.refreshCountdownSec = state.autoRefreshSec;
        executeAutoRefreshNow(
          `Auto-Refresh (${state.autoRefreshSec}d): memuat ulang daftar untuk mencari teman lain yang belum terkena colek...`
        );
      }
    }
  }, 1000);

  function init() {
    buildWidgetDOM();
    const initialButtons = findPokeBackButtons();
    state.detectedCount = initialButtons.length;
    const refreshStatusLabel =
      state.autoRefreshSec > 0 ? `Auto-Refresh ${state.autoRefreshSec}d` : 'Auto-Refresh MATI';
    addLog(
      `Panel siap (${refreshStatusLabel}). Terdeteksi ${state.pokeBackCount} Colek Balik + ${state.newPokeCount} Teman Belum Tercolek.`
    );
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
