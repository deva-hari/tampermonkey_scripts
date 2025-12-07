// ==UserScript==
// @name         WTR-Lab Smart Fluid Container
// @namespace    http://tampermonkey.net/
// @version      1.3
// @description  Calculates device width dynamically and overrides Bootstrap static steps with configurable UI
// @author       deva-hari
// @match        https://wtr-lab.com/*
// @match        https://www.wtr-lab.com/*
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @run-at       document-start
// @downloadURL  https://raw.githubusercontent.com/deva-hari/tampermonkey_scripts/main/WTR-Lab%20Smart%20Fluid%20Container.user.js
// @updateURL    https://raw.githubusercontent.com/deva-hari/tampermonkey_scripts/main/WTR-Lab%20Smart%20Fluid%20Container.user.js
// ==/UserScript==

(function() {
    'use strict';

    // --- Configuration ---
    // Load settings from storage or use defaults
    const DEFAULT_TOTAL_GUTTER = 20;
    const DEFAULT_MIN_TRIGGER_WIDTH = 576;
    const STORAGE_KEY = 'wtr_lab_smart_container_settings';

    let settings = {
        totalGutter: GM_getValue(STORAGE_KEY + '_totalGutter', DEFAULT_TOTAL_GUTTER),
        minTriggerWidth: GM_getValue(STORAGE_KEY + '_minTriggerWidth', DEFAULT_MIN_TRIGGER_WIDTH),
        enabled: GM_getValue(STORAGE_KEY + '_enabled', true),
        uiVisible: GM_getValue(STORAGE_KEY + '_uiVisible', false)
    };

    // --- UI Styles ---
    const uiStyles = `
        #wtr-smart-container-panel {
            position: fixed;
            top: 20px;
            right: 20px;
            background: white;
            border: 2px solid #333;
            border-radius: 8px;
            padding: 20px;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
            z-index: 10000;
            font-family: Arial, sans-serif;
            min-width: 280px;
            max-width: 350px;
            display: none;
        }

        #wtr-smart-container-panel.visible {
            display: block;
        }

        #wtr-smart-container-panel.collapsed {
            width: 50px;
            height: 50px;
            padding: 0;
            overflow: hidden;
        }

        #wtr-smart-container-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 15px;
            font-weight: bold;
            font-size: 16px;
        }

        .wtr-close-btn {
            background: none;
            border: none;
            font-size: 20px;
            cursor: pointer;
            color: #333;
            padding: 0;
            width: 30px;
            height: 30px;
            display: flex;
            align-items: center;
            justify-content: center;
        }

        .wtr-close-btn:hover {
            background-color: #f0f0f0;
            border-radius: 4px;
        }

        .wtr-toggle-btn {
            background: #4CAF50;
            color: white;
            border: none;
            border-radius: 4px;
            padding: 8px 12px;
            cursor: pointer;
            font-size: 14px;
            font-weight: bold;
            width: 100%;
            margin-bottom: 10px;
        }

        .wtr-toggle-btn:hover {
            background: #45a049;
        }

        .wtr-toggle-btn.disabled {
            background: #ccc;
        }

        .wtr-setting-group {
            margin-bottom: 15px;
        }

        .wtr-setting-label {
            display: block;
            font-weight: bold;
            margin-bottom: 5px;
            font-size: 14px;
            color: #333;
        }

        .wtr-setting-input {
            width: 100%;
            padding: 8px;
            border: 1px solid #ccc;
            border-radius: 4px;
            box-sizing: border-box;
            font-size: 14px;
        }

        .wtr-setting-value {
            display: inline-block;
            background: #f0f0f0;
            padding: 2px 6px;
            border-radius: 3px;
            margin-left: 5px;
            font-weight: normal;
        }

        .wtr-reset-btn {
            background: #f44336;
            color: white;
            border: none;
            border-radius: 4px;
            padding: 8px 12px;
            cursor: pointer;
            font-size: 12px;
            width: 100%;
        }

        .wtr-reset-btn:hover {
            background: #da190b;
        }

        .wtr-content {
            display: block;
        }

        #wtr-smart-container-panel.collapsed .wtr-content {
            display: none;
        }

        .wtr-collapse-btn {
            position: absolute;
            top: 5px;
            right: 5px;
            background: none;
            border: none;
            font-size: 24px;
            cursor: pointer;
            color: #333;
            padding: 0;
            width: 40px;
            height: 40px;
            display: none;
        }

        #wtr-smart-container-panel.collapsed .wtr-collapse-btn {
            display: flex;
            align-items: center;
            justify-content: center;
        }

        .wtr-collapse-btn:hover {
            background-color: rgba(0, 0, 0, 0.1);
            border-radius: 4px;
        }
    `;
    GM_addStyle(uiStyles);

    // --- 1. Inject Base CSS using CSS Variables ---
    function injectContainerCSS() {
        if (document.getElementById('wtr-container-css')) return; // Prevent duplicates

        const cssOverride = `
            @media (min-width: ${settings.minTriggerWidth}px) {
                .container, .container-md, .container-sm {
                    max-width: var(--smart-width, 100%) !important;
                    transition: max-width 0.1s ease-out;
                }
            }
        `;
        const style = document.createElement('style');
        style.id = 'wtr-container-css';
        style.textContent = cssOverride;
        document.head.appendChild(style);
    }

    // --- 2. Smart Calculation Logic ---
    function updateContainerWidth() {
        if (!settings.enabled) {
            document.documentElement.style.removeProperty('--smart-width');
            return;
        }

        const viewportWidth = window.innerWidth;

        if (viewportWidth < settings.minTriggerWidth) return;

        const newWidth = viewportWidth - settings.totalGutter;
        document.documentElement.style.setProperty('--smart-width', `${newWidth}px`);
    }

    // --- 3. Save Settings ---
    function saveSettings() {
        GM_setValue(STORAGE_KEY + '_totalGutter', settings.totalGutter);
        GM_setValue(STORAGE_KEY + '_minTriggerWidth', settings.minTriggerWidth);
        GM_setValue(STORAGE_KEY + '_enabled', settings.enabled);
        GM_setValue(STORAGE_KEY + '_uiVisible', settings.uiVisible);
        injectContainerCSS();
        updateContainerWidth();
    }

    // --- 4. Reset to Defaults ---
    function resetSettings() {
        settings = {
            totalGutter: DEFAULT_TOTAL_GUTTER,
            minTriggerWidth: DEFAULT_MIN_TRIGGER_WIDTH,
            enabled: true,
            uiVisible: false
        };
        saveSettings();
        updateUI();
    }

    // --- 5. Create UI Panel ---
    function createUIPanel() {
        if (document.getElementById('wtr-smart-container-panel')) return;

        const panel = document.createElement('div');
        panel.id = 'wtr-smart-container-panel';
        panel.innerHTML = `
            <button class="wtr-collapse-btn" id="wtr-expand-btn">⊕</button>
            <div class="wtr-content">
                <div id="wtr-smart-container-header">
                    <span>Smart Container Settings</span>
                    <button class="wtr-close-btn" id="wtr-close-btn">✕</button>
                </div>

                <button class="wtr-toggle-btn" id="wtr-enable-toggle">
                    ${settings.enabled ? 'Disable' : 'Enable'} Feature
                </button>

                <div class="wtr-setting-group">
                    <label class="wtr-setting-label">
                        Total Gutter (px)
                        <span class="wtr-setting-value" id="wtr-gutter-value">${settings.totalGutter}</span>
                    </label>
                    <input class="wtr-setting-input" type="number" id="wtr-gutter-input" 
                           value="${settings.totalGutter}" min="0" max="100">
                </div>

                <div class="wtr-setting-group">
                    <label class="wtr-setting-label">
                        Min Trigger Width (px)
                        <span class="wtr-setting-value" id="wtr-trigger-value">${settings.minTriggerWidth}</span>
                    </label>
                    <input class="wtr-setting-input" type="number" id="wtr-trigger-input" 
                           value="${settings.minTriggerWidth}" min="300" max="1200">
                </div>

                <button class="wtr-reset-btn" id="wtr-reset-btn">Reset to Defaults</button>
            </div>
        `;

        document.body.appendChild(panel);
        attachEventListeners();
    }

    // --- 6. Update UI Display ---
    function updateUI() {
        const gutterInput = document.getElementById('wtr-gutter-input');
        const triggerInput = document.getElementById('wtr-trigger-input');
        const gutterValue = document.getElementById('wtr-gutter-value');
        const triggerValue = document.getElementById('wtr-trigger-value');
        const toggleBtn = document.getElementById('wtr-enable-toggle');
        const panel = document.getElementById('wtr-smart-container-panel');

        if (gutterInput) gutterInput.value = settings.totalGutter;
        if (triggerInput) triggerInput.value = settings.minTriggerWidth;
        if (gutterValue) gutterValue.textContent = settings.totalGutter;
        if (triggerValue) triggerValue.textContent = settings.minTriggerWidth;
        if (toggleBtn) toggleBtn.textContent = settings.enabled ? 'Disable Feature' : 'Enable Feature';
        if (toggleBtn) toggleBtn.classList.toggle('disabled', !settings.enabled);
        
        if (panel) {
            if (settings.uiVisible) {
                panel.classList.add('visible');
                panel.classList.remove('collapsed');
            } else {
                panel.classList.remove('visible');
            }
        }
    }

    // --- 7. Attach Event Listeners ---
    function attachEventListeners() {
        const closeBtn = document.getElementById('wtr-close-btn');
        const expandBtn = document.getElementById('wtr-expand-btn');
        const enableToggle = document.getElementById('wtr-enable-toggle');
        const gutterInput = document.getElementById('wtr-gutter-input');
        const triggerInput = document.getElementById('wtr-trigger-input');
        const resetBtn = document.getElementById('wtr-reset-btn');
        const panel = document.getElementById('wtr-smart-container-panel');

        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                settings.uiVisible = false;
                saveSettings();
                updateUI();
            });
        }

        if (expandBtn) {
            expandBtn.addEventListener('click', () => {
                panel.classList.remove('collapsed');
            });
        }

        if (enableToggle) {
            enableToggle.addEventListener('click', () => {
                settings.enabled = !settings.enabled;
                saveSettings();
                updateUI();
            });
        }

        if (gutterInput) {
            gutterInput.addEventListener('change', (e) => {
                settings.totalGutter = parseInt(e.target.value) || DEFAULT_TOTAL_GUTTER;
                saveSettings();
                updateUI();
            });
        }

        if (triggerInput) {
            triggerInput.addEventListener('change', (e) => {
                settings.minTriggerWidth = parseInt(e.target.value) || DEFAULT_MIN_TRIGGER_WIDTH;
                saveSettings();
                updateUI();
            });
        }

        if (resetBtn) {
            resetBtn.addEventListener('click', () => {
                if (confirm('Reset all settings to defaults?')) {
                    resetSettings();
                }
            });
        }
    }

    // --- 3. Performance Observer ---
    function setupResizeObserver() {
        const observer = new ResizeObserver((entries) => {
            window.requestAnimationFrame(() => {
                updateContainerWidth();
            });
        });
        observer.observe(document.body);
    }

    // --- 8. Setup Hotkey (Shift + S to toggle settings panel) ---
    function setupHotkey() {
        document.addEventListener('keydown', (e) => {
            // Shift + S to toggle settings panel
            if (e.shiftKey && e.key === 'S') {
                settings.uiVisible = !settings.uiVisible;
                saveSettings();
                updateUI();
            }
        });
    }

    // --- Initialize ---
    function init() {
        injectContainerCSS();
        setupResizeObserver();
        setupHotkey();
        updateContainerWidth();

        // Create UI when DOM is ready
        if (document.body) {
            createUIPanel();
            updateUI();
        } else {
            document.addEventListener('DOMContentLoaded', () => {
                createUIPanel();
                updateUI();
            });
        }
    }

    init();

})();