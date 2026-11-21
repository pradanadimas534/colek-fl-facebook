(function () {
  const themeBtn = document.getElementById('popup-theme-btn');
  const badgeEl = document.getElementById('popup-badge');
  const countersEl = document.getElementById('popup-counters');
  const messageEl = document.getElementById('popup-message');
  const pokeBtn = document.getElementById('popup-poke-btn');
  const scanBtn = document.getElementById('popup-scan-btn');
  const logListEl = document.getElementById('popup-log-list');

  let currentTheme = localStorage.getItem('cbf_theme') || 'light';

  function applyTheme(theme) {
    currentTheme = theme;
    document.body.setAttribute('data-theme', theme);
    themeBtn.textContent = theme === 'light' ? 'Gelap' : 'Terang';
    localStorage.setItem('cbf_theme', theme);
  }

  function updateUI(payload) {
    if (!payload) {
      badgeEl.textContent = '[GALAT]';
      badgeEl.setAttribute('data-state', 'error');
      messageEl.textContent = 'Tab aktif bukan halaman Facebook Pokes atau belum dimuat. Klik "Buka facebook.com/pokes" di bawah.';
      pokeBtn.disabled = true;
      return;
    }

    const detected = payload.detectedCount || 0;
    const poked = payload.pokedSessionCount || 0;
    countersEl.textContent = `Siap: ${detected} | Terbalas: ${poked}`;
    pokeBtn.textContent = `Balas Semua Colekan Sekarang (${detected})`;
    pokeBtn.disabled = payload.status === 'LOADING';

    if (payload.status === 'DONE') {
      badgeEl.textContent = '[SELESAI]';
      badgeEl.setAttribute('data-state', 'success');
      messageEl.textContent = `Berhasil membalas colekan. Total terbalas sesi ini: ${poked} teman.`;
    } else if (payload.status === 'EMPTY') {
      badgeEl.textContent = '[KOSONG]';
      badgeEl.setAttribute('data-state', 'normal');
      messageEl.textContent = 'Tidak ada tombol Colek Balik yang aktif pada tab ini.';
    } else if (payload.status === 'ERROR') {
      badgeEl.textContent = '[GALAT]';
      badgeEl.setAttribute('data-state', 'error');
      messageEl.textContent = `Kendala: ${payload.lastError || 'Gagal berinteraksi dengan halaman'}.`;
    } else {
      badgeEl.textContent = '[SIAP]';
      badgeEl.setAttribute('data-state', 'normal');
      messageEl.textContent = `Ditemukan ${detected} tombol Colek Balik siap dieksekusi.`;
    }

    if (Array.isArray(payload.logs) && payload.logs.length > 0) {
      logListEl.innerHTML = payload.logs
        .map((line) => `<p class="popup-log-item">${escapeHtml(line)}</p>`)
        .join('');
    }
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function sendToActiveTab(action) {
    // Support running inside the local sandbox preview or as a live browser extension popup.
    if (window.opener && window.opener.CBFController) {
      if (action === 'CBF_POKE_ALL') window.opener.CBFController.pokeAll();
      if (action === 'CBF_SCAN') window.opener.CBFController.scanPage();
      updateUI(window.opener.CBFController.getState());
      return;
    }

    if (window.CBFController) {
      if (action === 'CBF_POKE_ALL') window.CBFController.pokeAll();
      if (action === 'CBF_SCAN') window.CBFController.scanPage();
      updateUI(window.CBFController.getState());
      return;
    }

    if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.query) {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const activeTab = tabs && tabs[0];
        if (!activeTab || !activeTab.id) {
          updateUI(null);
          return;
        }
        chrome.tabs.sendMessage(activeTab.id, { action }, (response) => {
          if (chrome.runtime.lastError || !response) {
            updateUI(null);
            return;
          }
          updateUI(response);
        });
      });
    } else {
      badgeEl.textContent = '[MODE PRATINJAU]';
      badgeEl.setAttribute('data-state', 'normal');
      messageEl.textContent = 'Pratinjau Popup mandiri aktif. Buka Sandbox Simulator untuk menguji klik langsung pada daftar colekan.';
      logListEl.innerHTML = '<p class="popup-log-item">[Pratinjau] Popup siap dihubungkan ke tab aktif.</p>';
    }
  }

  themeBtn.addEventListener('click', () => {
    const next = currentTheme === 'light' ? 'dark' : 'light';
    applyTheme(next);
    if (window.CBFController) {
      window.CBFController.setTheme(next);
    }
  });

  pokeBtn.addEventListener('click', () => {
    sendToActiveTab('CBF_POKE_ALL');
  });

  scanBtn.addEventListener('click', () => {
    sendToActiveTab('CBF_SCAN');
  });

  applyTheme(currentTheme);
  sendToActiveTab('CBF_GET_STATE');
})();
