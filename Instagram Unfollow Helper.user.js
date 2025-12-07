// ==UserScript==
// @name         Instagram Unfollow Helper
// @namespace    https://deva-ig-unfollow-helper
// @version      1.1
// @description  Safely unfollow with delays.
// @author       deva-hari
// @match        https://www.instagram.com/*
// @grant        GM_addStyle
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_notification
// @downloadURL  https://raw.githubusercontent.com/deva-hari/tampermonkey_scripts/main/Instagram%20Unfollow%20Helper.user.js
// @updateURL    https://raw.githubusercontent.com/deva-hari/tampermonkey_scripts/main/Instagram%20Unfollow%20Helper.user.js
// ==/UserScript==

(function () {
  'use strict';

  // ========= CONFIG =========

  const DEFAULT_CONFIG = {
    unfollowLimit: 25,
    minDelay: 2500,
    maxDelay: 5500,
    autoScroll: true,
    dryRun: false,
    skipKeywords: '',
    runCount: 1,
    intervalMinutes: 20,
    scrollPx: 900 // <-- NEW CONFIG
  };

  function loadConfig() {
    return {
      unfollowLimit: Number(GM_getValue('unfollowLimit', DEFAULT_CONFIG.unfollowLimit)),
      minDelay: Number(GM_getValue('minDelay', DEFAULT_CONFIG.minDelay)),
      maxDelay: Number(GM_getValue('maxDelay', DEFAULT_CONFIG.maxDelay)),
      autoScroll: !!GM_getValue('autoScroll', DEFAULT_CONFIG.autoScroll),
      dryRun: !!GM_getValue('dryRun', DEFAULT_CONFIG.dryRun),
      skipKeywords: GM_getValue('skipKeywords', DEFAULT_CONFIG.skipKeywords),
      runCount: Number(GM_getValue('runCount', DEFAULT_CONFIG.runCount)),
      intervalMinutes: Number(GM_getValue('intervalMinutes', DEFAULT_CONFIG.intervalMinutes)),
      scrollPx: Number(GM_getValue('scrollPx', DEFAULT_CONFIG.scrollPx))
    };
  }

  function saveConfig(cfg) {
    GM_setValue('unfollowLimit', cfg.unfollowLimit);
    GM_setValue('minDelay', cfg.minDelay);
    GM_setValue('maxDelay', cfg.maxDelay);
    GM_setValue('autoScroll', cfg.autoScroll);
    GM_setValue('dryRun', cfg.dryRun);
    GM_setValue('skipKeywords', cfg.skipKeywords);
    GM_setValue('runCount', cfg.runCount);
    GM_setValue('intervalMinutes', cfg.intervalMinutes);
    GM_setValue('scrollPx', cfg.scrollPx);
  }

  let config = loadConfig();

  // ========= STATE =========
  let isRunning = false;
  let runActive = false;
  let currentRun = 0;
  let unfollowedCount = 0;
  let scrollAttempts = 0;
  let cooldownTimeoutId = null;

  let panelEl = null;
  let statusEl = null;
  let startBtn = null;
  let stopBtn = null;
  let testScrollBtn = null;

  // ========= STYLES (cut for brevity — same as v4) =========
  GM_addStyle(`
    /* panel styles omitted for brevity but same as earlier */
    #ig-unfollow-panel {
      position: fixed; top: 90px; right: 20px;
      z-index:999999; background:rgba(12,12,12,.95); color:#fff;
      padding:12px 14px; border-radius:12px; width:320px;
      font-family:system-ui; font-size:12px;
    }
    #ig-unfollow-panel h2 { margin:0 0 6px; font-size:13px; font-weight:600; display:flex; justify-content:space-between; }
    .iguf-row { display:flex; justify-content:space-between; margin:4px 0; gap:4px; }
    .iguf-row input { width:120px; background:#111; color:#fff; border-radius:6px; padding:3px; border:1px solid rgba(255,255,255,0.2); }
    .iguf-buttons { display:flex; gap:6px; margin-top:6px; }
    button { cursor:pointer; padding:5px 6px; border-radius:999px; border:none; }
    #ig-unfollow-start { background:#28a745; color:#fff; }
    #ig-unfollow-stop { background:#ff4444; color:#fff; }
    #ig-unfollow-testscroll { background:#555; color:#fff; }
  `);

  // ========= DOM HELPERS =========

  function getDialog() {
    return document.querySelector('div[role="dialog"]');
  }

  function getScrollContainer() {
    const dialog = getDialog();
    if (!dialog) return null;

    let scroller = dialog.querySelector('div._aano');
    if (scroller && scroller.scrollHeight > scroller.clientHeight + 20) return scroller;

    const all = dialog.querySelectorAll('div');
    for (const el of all) {
      const cs = getComputedStyle(el);
      if ((cs.overflowY === 'auto' || cs.overflowY === 'scroll') &&
          el.scrollHeight > el.clientHeight + 20) {
        return el;
      }
    }

    return dialog.scrollHeight > dialog.clientHeight + 20 ? dialog : null;
  }

  function findFollowingButtons() {
    const dlg = getDialog();
    if (!dlg) return [];
    return [...dlg.querySelectorAll('button')].filter(b => b.innerText.trim().toLowerCase() === 'following');
  }

  function findUnfollowButton() {
    return [...document.querySelectorAll('button')].find(b => {
      const txt = b.innerText.trim().toLowerCase();
      return txt === 'unfollow' || txt.includes('unfollow');
    });
  }

  function getUserLabel(btn) {
    const row = btn.closest('li, div[role="button"], div') || btn;
    const candidates = row.querySelectorAll('a, span');
    for (const e of candidates) {
      const t = e.innerText.trim();
      if (t && t.length < 40) return t;
    }
    return '(unknown)';
  }

  function shouldSkip(btn) {
    const raw = config.skipKeywords;
    if (!raw) return false;
    const keys = raw.split(',').map(k => k.trim().toLowerCase()).filter(Boolean);
    if (!keys.length) return false;
    const row = btn.closest('li, div[role="button"], div');
    const text = row.innerText.toLowerCase();
    return keys.some(k => text.includes(k));
  }

  // ========= UI CREATION =========

  function createPanel() {
    panelEl = document.createElement('div');
    panelEl.id = 'ig-unfollow-panel';

    panelEl.innerHTML = `
      <h2>Unfollow Helper <span>⚠️</span></h2>

      <div class="iguf-row">
        <label>Unfollow per run</label>
        <input id="cfg-limit" type="number">
      </div>

      <div class="iguf-row">
        <label>Min delay (ms)</label>
        <input id="cfg-min" type="number">
      </div>

      <div class="iguf-row">
        <label>Max delay (ms)</label>
        <input id="cfg-max" type="number">
      </div>

      <div class="iguf-row">
        <label>Scroll amount (px)</label>
        <input id="cfg-scroll" type="number">
      </div>

      <div class="iguf-row">
        <label>Runs</label>
        <input id="cfg-runs" type="number">
      </div>

      <div class="iguf-row">
        <label>Interval (min)</label>
        <input id="cfg-int" type="number">
      </div>

      <div class="iguf-row">
        <label>Skip keywords</label>
        <input id="cfg-skip" type="text">
      </div>

      <div class="iguf-row">
        <label>Auto-scroll</label>
        <input id="cfg-auto" type="checkbox">
      </div>

      <div class="iguf-row">
        <label>Dry-run</label>
        <input id="cfg-dry" type="checkbox">
      </div>

      <div class="iguf-buttons">
        <button id="ig-unfollow-start">Start</button>
        <button id="ig-unfollow-stop" disabled>Stop</button>
        <button id="ig-unfollow-testscroll">Test scroll</button>
      </div>

      <div id="ig-unfollow-status">Status: idle<br>Unfollowed: 0</div>
    `;

    document.body.appendChild(panelEl);

    statusEl = panelEl.querySelector('#ig-unfollow-status');
    startBtn = panelEl.querySelector('#ig-unfollow-start');
    stopBtn = panelEl.querySelector('#ig-unfollow-stop');
    testScrollBtn = panelEl.querySelector('#ig-unfollow-testscroll');

    // load config into fields
    panelEl.querySelector('#cfg-limit').value = config.unfollowLimit;
    panelEl.querySelector('#cfg-min').value = config.minDelay;
    panelEl.querySelector('#cfg-max').value = config.maxDelay;
    panelEl.querySelector('#cfg-scroll').value = config.scrollPx;
    panelEl.querySelector('#cfg-runs').value = config.runCount;
    panelEl.querySelector('#cfg-int').value = config.intervalMinutes;
    panelEl.querySelector('#cfg-skip').value = config.skipKeywords;
    panelEl.querySelector('#cfg-auto').checked = config.autoScroll;
    panelEl.querySelector('#cfg-dry').checked = config.dryRun;

    // save listeners
    panelEl.querySelector('#cfg-limit').oninput = e => { config.unfollowLimit = +e.target.value; saveConfig(config); };
    panelEl.querySelector('#cfg-min').oninput = e => { config.minDelay = +e.target.value; saveConfig(config); };
    panelEl.querySelector('#cfg-max').oninput = e => { config.maxDelay = +e.target.value; saveConfig(config); };
    panelEl.querySelector('#cfg-scroll').oninput = e => { config.scrollPx = +e.target.value; saveConfig(config); };
    panelEl.querySelector('#cfg-runs').oninput = e => { config.runCount = +e.target.value; saveConfig(config); };
    panelEl.querySelector('#cfg-int').oninput = e => { config.intervalMinutes = +e.target.value; saveConfig(config); };
    panelEl.querySelector('#cfg-skip').oninput = e => { config.skipKeywords = e.target.value; saveConfig(config); };
    panelEl.querySelector('#cfg-auto').oninput = e => { config.autoScroll = e.target.checked; saveConfig(config); };
    panelEl.querySelector('#cfg-dry').oninput = e => { config.dryRun = e.target.checked; saveConfig(config); };

    startBtn.onclick = startSession;
    stopBtn.onclick = stopSession;
    testScrollBtn.onclick = handleTestScroll;
  }

  // ========= STATUS =========

  function updateStatus(extra) {
    statusEl.innerHTML =
      `Status: ${isRunning ? (runActive ? 'running' : 'waiting') : 'idle'}<br>` +
      `Run ${currentRun}/${config.runCount}<br>` +
      `Unfollowed: ${unfollowedCount}` +
      (extra ? `<br>${extra}` : '');
  }

  // ========= MAIN LOOP =========

  function processNext() {
    if (!isRunning || !runActive) return;

    if (unfollowedCount >= config.unfollowLimit) {
      return finishRun(`Reached limit ${unfollowedCount}`);
    }

    let btns = findFollowingButtons().filter(b => !shouldSkip(b));
    if (!btns.length) {
      const scroller = getScrollContainer();
      if (config.autoScroll && scroller) {
        scrollAttempts++;
        if (scrollAttempts > 5) {
          return finishRun('Auto-scroll limit reached.');
        }
        scroller.scrollTop += config.scrollPx;
        updateStatus(`Auto-scroll attempt ${scrollAttempts}`);
        return setTimeout(processNext, 1200);
      }
      return finishRun('No more people visible.');
    }

    scrollAttempts = 0;
    const btn = btns[0];
    const label = getUserLabel(btn);

    if (config.dryRun) {
      unfollowedCount++;
      updateStatus(`Dry-run: "${label}"`);
      return setTimeout(processNext, config.minDelay);
    }

    btn.click();
    updateStatus(`Clicked Following for "${label}"`);

    setTimeout(() => {
      const confirm = findUnfollowButton();
      if (confirm) {
        confirm.click();
        unfollowedCount++;
        updateStatus(`Unfollowed "${label}"`);
        return setTimeout(processNext, config.minDelay);
      } else {
        updateStatus(`No Unfollow button found for "${label}"`);
        return setTimeout(processNext, config.minDelay);
      }
    }, 400);
  }

  // ========= RUN MANAGEMENT =========

  function startSession() {
    if (isRunning) return;

    isRunning = true;
    currentRun = 0;
    unfollowedCount = 0;
    scrollAttempts = 0;
    runActive = false;

    startBtn.disabled = true;
    stopBtn.disabled = false;

    startNextRun();
  }

  function startNextRun() {
    currentRun++;
    if (currentRun > config.runCount) return finishSession('All runs complete.');

    runActive = true;
    unfollowedCount = 0;
    scrollAttempts = 0;

    updateStatus(`Starting run ${currentRun}/${config.runCount}`);
    processNext();
  }

  function finishRun(reason) {
    runActive = false;
    updateStatus(`Run ended: ${reason}`);
    if (currentRun >= config.runCount) return finishSession('All runs done.');

    cooldownTimeoutId = setTimeout(() => {
      startNextRun();
    }, config.intervalMinutes * 60 * 1000);

    updateStatus(`Waiting ${config.intervalMinutes} min for next run…`);
  }

  function finishSession(reason) {
    isRunning = false;
    runActive = false;

    startBtn.disabled = false;
    stopBtn.disabled = true;

    if (cooldownTimeoutId) clearTimeout(cooldownTimeoutId);

    updateStatus(reason);
  }

  function stopSession() {
    isRunning = false;
    runActive = false;

    if (cooldownTimeoutId) clearTimeout(cooldownTimeoutId);

    startBtn.disabled = false;
    stopBtn.disabled = true;

    updateStatus('Stopped by user');
  }

  // ========= TEST SCROLL =========

  function handleTestScroll() {
    const scroller = getScrollContainer();
    if (!scroller) return updateStatus('No scroll container found.');
    scroller.scrollTop += config.scrollPx;
    updateStatus(`Scrolled ${config.scrollPx}px`);
  }

  // ========= INIT =========

  function initWhenReady() {
    if (document.body) createPanel();
    else {
      const m = new MutationObserver(() => {
        if (document.body) {
          m.disconnect();
          createPanel();
        }
      });
      m.observe(document.documentElement, { childList: true, subtree: true });
    }
  }

  initWhenReady();

})();
