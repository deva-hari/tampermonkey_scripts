// ==UserScript==
// @name         AI Element Translator
// @namespace    https://deva.ai/element-translator
// @version      0.5
// @description  Pick elements on a page, send their text to a configurable AI (OpenAI-compatible) for translation, and replace in-place.
// @author       you
// @match        *://*/*
// @run-at       document-end
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest
// @connect      *
// @downloadURL  https://raw.githubusercontent.com/deva-hari/tampermonkey_scripts/main/AI%20Element%20Translator.user.js
// @updateURL    https://raw.githubusercontent.com/deva-hari/tampermonkey_scripts/main/AI%20Element%20Translator.user.js
// @noframes
// ==/UserScript==

(function () {
    'use strict';

    // ---------- Defaults & Settings ----------

    const SETTINGS_KEY = 'ai_element_translator_settings_v1';
    const SAVED_ELEMENTS_KEY = 'ai_element_translator_saved_elements_v1';
    const TRANSLATION_CACHE_KEY = 'ai_element_translator_cache_v1';

    // Provider configurations
    const PROVIDERS = {
        groq: {
            name: 'Groq',
            apiUrl: 'https://api.groq.com/openai/v1/chat/completions',
            models: [
                'llama-3.1-8b-instant',
                'llama-3.1-70b-versatile',
                'mixtral-8x7b-32768',
                'gemma-7b-it',
                'openai/gpt-oss-120b',
                'openai/gpt-oss-20b',
                'moonshotai/kimi-k2-instruct',
                'moonshotai/kimi-k2-instruct-0905'
            ]
        },
        openrouter: {
            name: 'OpenRouter',
            apiUrl: 'https://openrouter.ai/api/v1/chat/completions',
            models: [
                'meta-llama/llama-3.3-70b-instruct:free',
                'nousresearch/hermes-3-llama-3.1-405b:free',
                'meta-llama/llama-3.2-3b-instruct:free',
                'meta-llama/llama-3.1-405b-instruct:free',
                'openai/gpt-3.5-turbo',
                'openai/gpt-oss-20b:free',
                'amazon/nova-2-lite-v1:free',
                'qwen/qwen3-4b:free',
                'moonshotai/kimi-k2:free'
            ]
        },
        gemini: {
            name: 'Google Gemini',
            apiUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/',
            models: [
                'gemini-3-pro-preview',
                'gemini-2.5-flash',
                'gemini-2.5-flash-preview-09-2025',
                'gemini-2.5-flash-lite',
                'gemini-2.5-flash-lite-preview-09-2025'

            ],
            note: 'Use your Google API key'
        },
        custom: {
            name: 'Chutes AI',
            apiUrl: 'https://llm.chutes.ai/v1/chat/completions',
            models: [
                'openai/gpt-oss-20b',
                'unsloth/gemma-3-4b-it',
                'zai-org/GLM-4.5-Air',
                'Alibaba-NLP/Tongyi-DeepResearch-30B-A3B'
            ]
        }
    };

    const DEFAULT_SETTINGS = {
        enabled: true,
        provider: 'groq',
        apiUrl: 'https://api.groq.com/openai/v1/chat/completions',
        apiKey: '',
        model: 'llama-3.1-8b-instant',
        temperature: 0.2,
        sourceLang: 'auto',
        targetLang: 'English',
             systemPrompt: `You are an elite literary translation engine specialized in long-form web-novels
(xianxia, xuanhuan, historical, slice-of-life, romance, modern urban, etc.).

Task:
Translate the user-provided text from SOURCE_LANG to TARGET_LANG with
publication-quality prose.

Core Style Requirements:
- Produce natural, immersive, novel-grade prose suitable for serialized web fiction.
- Preserve the author’s voice, narrative rhythm, and emotional weight.
- Maintain show-don’t-tell phrasing where present.
- Avoid literal, stiff, or mechanical translations.
- Do not simplify complex emotions, social dynamics, or power hierarchies.

Narrative Fidelity Rules:
- Do not add, remove, summarize, censor, or reinterpret content.
- Preserve pacing, sentence-length intent, and dramatic beats.
- Retain ambiguity when the original is ambiguous.
- Keep internal monologue distinct from narration and dialogue.
- Match emotional intensity precisely:
    irritation ≠ anger ≠ fury
    affection ≠ infatuation ≠ obsession

Dialogue & Character Consistency:
- Dialogue must sound natural in TARGET_LANG, not translated.
- Maintain character voice consistency across all lines.
- Reflect social hierarchy, familiarity, and emotional distance through word choice.
- Do not flatten sarcasm, teasing, or passive aggression.

Cultural & Linguistic Handling:
- Idioms & metaphors:
    - Preserve metaphors where possible.
    - If a metaphor does not transfer, replace it with a functionally equivalent
        literary expression rather than a literal one.
- Honorifics & relationship terms (e.g., 妈, 娘, 哥, 姐, 师父):
    - Use consistent, context-appropriate equivalents.
    - Do not mix multiple TARGET_LANG forms for the same role unless the original does.
- Names, titles, cultivation terms, and ranks:
    - Keep consistent throughout the text.
    - Do not invent new terminology.
- Do not insert explanations, footnotes, or glossaries.

Input Format:
- The input consists of multiple lines.
- Each line begins with a unique marker in the format "__SEG_N__"
    (for example, "__SEG_0__").

Hard Constraints (Non-Negotiable):
- Preserve each marker exactly as provided.
- Translate only the text that appears after the marker on each line.
- Maintain the exact number of lines and their original order.
- Do not merge, split, reorder, or omit any lines.
- Do not add any text outside the translated content.

Output Format:
Each output line must strictly follow this structure:
__SEG_N__ <translated text>

Quality Bar:
- The output should read as if it were originally written in TARGET_LANG.
- The prose should be suitable for publication in a web-novel.
- The translation must remain faithful enough that bilingual readers cannot
    detect loss of nuance or intent.

Failure to meet any constraint is considered an incorrect translation.`

    };

    function loadSettings() {
        try {
            const raw = GM_getValue(SETTINGS_KEY, null);
            if (!raw) return { ...DEFAULT_SETTINGS };
            const parsed = JSON.parse(raw);
            return { ...DEFAULT_SETTINGS, ...parsed };
        } catch (e) {
            console.error('[AI Translator] Failed to load settings:', e);
            return { ...DEFAULT_SETTINGS };
        }
    }

    function saveSettings(settings) {
        GM_setValue(SETTINGS_KEY, JSON.stringify(settings));
        // If panel is visible, update provider/model badges
        try {
            if (panelEl) {
                const pb = panelEl.querySelector && panelEl.querySelector('#ai-provider-badge');
                const mb = panelEl.querySelector && panelEl.querySelector('#ai-model-badge');
                if (pb) pb.textContent = settings.provider || '';
                if (mb) mb.textContent = settings.model || '';
            }
        } catch (e) {
            console.warn('[AI Translator] Failed to update badges', e);
        }
    }

    function getCurrentDomain() {
        try {
            return new URL(window.location.href).hostname;
        } catch (e) {
            return 'unknown';
        }
    }

    function loadSavedElements() {
        try {
            const raw = GM_getValue(SAVED_ELEMENTS_KEY, null);
            if (!raw) return {};
            return JSON.parse(raw);
        } catch (e) {
            console.error('[AI Translator] Failed to load saved elements:', e);
            return {};
        }
    }

    function loadTranslationCache() {
        try {
            const raw = GM_getValue(TRANSLATION_CACHE_KEY, null);
            if (!raw) return {};
            return JSON.parse(raw);
        } catch (e) {
            console.error('[AI Translator] Failed to load translation cache:', e);
            return {};
        }
    }

    function saveTranslationCache(cache) {
        try {
            GM_setValue(TRANSLATION_CACHE_KEY, JSON.stringify(cache));
        } catch (e) {
            console.error('[AI Translator] Failed to save translation cache:', e);
        }
    }

    function clearTranslationCache() {
        try {
            GM_setValue(TRANSLATION_CACHE_KEY, JSON.stringify({}));
        } catch (e) {
            console.error('[AI Translator] Failed to clear translation cache:', e);
        }
    }

    function saveSavedElements(data) {
        GM_setValue(SAVED_ELEMENTS_KEY, JSON.stringify(data));
    }

    function getSavedElementForDomain(domain) {
        const saved = loadSavedElements();
        return saved[domain] || null;
    }

    function saveElementForDomain(domain, selector, xpath) {
        const saved = loadSavedElements();
        saved[domain] = { selector, xpath, timestamp: Date.now() };
        saveSavedElements(saved);
    }

    // Updated signature: store selector, xpath, and a short text snippet to help locate element later
    function saveElementForDomain(domain, selector, xpath, snippet) {
        const saved = loadSavedElements();
        saved[domain] = { selector, xpath, snippet: snippet || '', timestamp: Date.now() };
        saveSavedElements(saved);
    }

    function getElementByXPath(xpath) {
        const result = document.evaluate(
            xpath,
            document,
            null,
            XPathResult.FIRST_ORDERED_NODE_TYPE,
            null
        );
        return result.singleNodeValue;
    }

    function getElementXPath(el) {
        if (el.id !== '')
            return "//*[@id='" + el.id + "']";
        if (el === document.body)
            return '/body';

        const ix = Array.from(el.parentNode.children).indexOf(el) + 1;
        const xpath = getElementXPath(el.parentNode) + '/' + el.tagName.toLowerCase() + '[' + ix + ']';
        return xpath;
    }

    // Build a reasonably specific CSS selector for an element
    function getCssSelector(el) {
        if (!el) return null;
        if (el.id) return `#${el.id}`;
        const parts = [];
        let cur = el;
        while (cur && cur.nodeType === 1 && cur !== document.documentElement) {
            let part = cur.tagName.toLowerCase();
            if (cur.className) {
                const classes = String(cur.className).trim().split(/\s+/).filter(Boolean);
                if (classes.length) part += '.' + classes.join('.');
            }
            const parent = cur.parentNode;
            if (parent) {
                const siblings = Array.from(parent.children).filter(c => c.tagName === cur.tagName);
                if (siblings.length > 1) {
                    const idx = Array.from(parent.children).indexOf(cur) + 1;
                    part += `:nth-child(${idx})`;
                }
            }
            parts.unshift(part);
            cur = cur.parentNode;
        }
        return parts.join(' > ');
    }

    function getFirstTextSnippet(el, maxLen = 80) {
        try {
            const nodes = collectTextNodes(el);
            if (!nodes || !nodes.length) return '';
            const txt = nodes[0].nodeValue.trim().replace(/\s+/g, ' ');
            return txt.length > maxLen ? txt.slice(0, maxLen) : txt;
        } catch (e) {
            return '';
        }
    }

    // Try multiple strategies to locate a previously-saved element
    function findElementFromSaved(saved) {
        if (!saved) return null;
        // 1) XPath
        if (saved.xpath) {
            try {
                const el = getElementByXPath(saved.xpath);
                if (el) return el;
                console.log('[AI Translator] XPath lookup failed for', saved.xpath);
            } catch (e) {
                console.warn('[AI Translator] XPath lookup error', e);
            }
        }

        // 2) CSS selector
        if (saved.selector) {
            try {
                // If selector looks like an id (#...), use querySelector directly
                const byQuery = document.querySelector(saved.selector);
                if (byQuery) return byQuery;

                // If selector appears to be a simple class string (no special chars), try getElementsByClassName
                if (/^[a-zA-Z0-9_\- ]+$/.test(saved.selector)) {
                    const cls = saved.selector.trim().split(/\s+/)[0];
                    const els = document.getElementsByClassName(cls);
                    if (els && els.length) return els[0];
                }
            } catch (e) {
                console.warn('[AI Translator] selector lookup error', e);
            }
        }

        // 3) Try to find an element containing the saved text snippet
        if (saved.snippet) {
            try {
                const snippet = saved.snippet.trim().slice(0, 80);
                const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
                let node;
                while ((node = walker.nextNode())) {
                    if (!node.nodeValue) continue;
                    if (node.nodeValue.indexOf(snippet) !== -1) {
                        return node.parentElement || node;
                    }
                }
            } catch (e) {
                console.warn('[AI Translator] snippet lookup error', e);
            }
        }

        return null;
    }

    let settings = loadSettings();

    // ---------- Styles ----------

    GM_addStyle(`
        .ai-translator-panel {
            position: fixed;
            bottom: 10px;
            right: 10px;
            z-index: 999999;
            background: rgba(20, 20, 20, 0.95);
            color: #fff;
            font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
            font-size: 12px;
            border-radius: 8px;
            padding: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.4);
            max-width: 260px;
        }
        .ai-translator-panel * {
            box-sizing: border-box;
        }
        .ai-translator-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 6px;
        }
        .ai-translator-title {
            font-size: 12px;
            font-weight: 600;
        }
        .ai-translator-close {
            background: transparent;
            border: none;
            color: #ccc;
            font-size: 14px;
            padding: 0 4px;
        }
        .ai-translator-row {
            margin-bottom: 4px;
        }
        .ai-translator-row label {
            display: block;
            margin-bottom: 2px;
        }
        .ai-translator-select,
        .ai-translator-input {
            width: 100%;
            border-radius: 4px;
            border: 1px solid #444;
            background: #222;
            color: #fff;
            padding: 4px;
            font-size: 11px;
        }
        .ai-translator-btn {
            width: 100%;
            margin-top: 4px;
            padding: 6px;
            border-radius: 4px;
            border: none;
            font-size: 12px;
            font-weight: 600;
            background: #4a90e2;
            color: #fff;
        }
        .ai-translator-btn:disabled {
            opacity: 0.6;
        }
        .ai-translator-small-btn {
            border-radius: 4px;
            border: none;
            font-size: 11px;
            padding: 4px 6px;
            background: #333;
            color: #fff;
            margin-right: 4px;
        }
        .ai-translator-status {
            margin-top: 4px;
            font-size: 11px;
            color: #ccc;
        }
        .ai-translator-highlight {
            outline: 2px solid #4a90e2 !important;
            cursor: crosshair !important;
        }
        .ai-translator-config-overlay {
            position: fixed;
            inset: 0;
            z-index: 999999;
            background: rgba(0,0,0,0.6);
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .ai-translator-config-modal {
            background: #181818;
            color: #fff;
            border-radius: 8px;
            padding: 10px;
            max-width: 340px;
            width: 90%;
            max-height: 90%;
            overflow: auto;
            font-size: 12px;
        }
        .ai-translator-config-modal h2 {
            font-size: 14px;
            margin-top: 0;
            margin-bottom: 6px;
        }
        .ai-translator-config-modal label {
            display: block;
            margin-top: 6px;
            margin-bottom: 2px;
        }
        .ai-translator-config-modal textarea {
            width: 100%;
            min-height: 80px;
            border-radius: 4px;
            border: 1px solid #444;
            background: #222;
            color: #fff;
            padding: 4px;
            font-size: 11px;
        }
        .ai-translator-config-modal input {
            width: 100%;
            border-radius: 4px;
            border: 1px solid #444;
            background: #222;
            color: #fff;
            padding: 4px;
            font-size: 11px;
        }
        .ai-translator-config-actions {
            display: flex;
            justify-content: flex-end;
            margin-top: 8px;
        }
        .ai-translator-config-actions button {
            border-radius: 4px;
            border: none;
            padding: 5px 8px;
            font-size: 12px;
            margin-left: 6px;
        }
        .ai-translator-config-save {
            background: #4a90e2;
            color: #fff;
        }
        .ai-translator-config-cancel {
            background: #333;
            color: #fff;
        }
        .ai-translator-toggle-row {
            display: flex;
            align-items: center;
            gap: 4px;
            margin-bottom: 4px;
        }
        .ai-translator-toggle-row input {
            margin: 0;
        }
        /* New grid layout */
        .ai-translator-grid {
            display: grid;
            grid-template-columns: 1fr;
            gap: 8px;
        }
        .ai-translator-section {
            padding: 6px;
            border-radius: 6px;
            background: rgba(255,255,255,0.02);
            border: 1px solid rgba(255,255,255,0.03);
        }
        .ai-translator-controls {
            display:flex;
            gap:6px;
            flex-wrap:wrap;
        }
        .ai-translator-controls .ai-translator-btn {
            flex:1 1 48%;
            padding:8px 6px;
            font-size:12px;
        }
        .ai-translator-small-row {
            display:flex;
            gap:6px;
            align-items:center;
            justify-content:space-between;
        }
        .ai-translator-footer {
            display:flex;
            gap:6px;
            align-items:center;
            justify-content:space-between;
            margin-top:6px;
            font-size:11px;
            color:#ccc;
        }
        .ai-translator-mini {
            font-size:11px;
            opacity:0.85;
        }
    `);

    // ---------- Panel & Config UI ----------

    let panelEl = null;
    let statusEl = null;

    function createPanel() {
        if (panelEl) return;

        panelEl = document.createElement('div');
        panelEl.className = 'ai-translator-panel';

        panelEl.innerHTML = `
            <div class="ai-translator-header" style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
                <div style="display:flex;flex-direction:column;">
                    <div class="ai-translator-title">AI Translator</div>
                    <div class="ai-translator-mini">Provider: <span id="ai-provider-badge">${escapeHtml((settings.provider||'groq'))}</span></div>
                </div>
                <div style="display:flex;gap:6px;align-items:center;">
                    <button class="ai-translator-small-btn" id="ai-translator-help-btn">?</button>
                    <button class="ai-translator-close" title="Hide panel">×</button>
                </div>
            </div>

            <div class="ai-translator-grid">
                <div class="ai-translator-section">
                    <div class="ai-translator-small-row">
                        <label style="display:flex;align-items:center;gap:6px;margin:0;"><input type="checkbox" id="ai-translator-enabled"> Enabled</label>
                        <div class="ai-translator-mini">Model: <span id="ai-model-badge">${escapeHtml(settings.model||'')}</span></div>
                    </div>
                    <div style="margin-top:8px;display:flex;gap:6px;">
                        <div style="flex:1;">
                            <label style="display:block;font-size:12px;margin-bottom:4px;">Source</label>
                            <select id="ai-translator-source" class="ai-translator-select">
                                <option value="auto">Auto-detect</option>
                                <option value="English">English</option>
                                <option value="Chinese">Chinese</option>
                                <option value="Japanese">Japanese</option>
                                <option value="Korean">Korean</option>
                                <option value="Spanish">Spanish</option>
                                <option value="French">French</option>
                                <option value="German">German</option>
                                <option value="Hindi">Hindi</option>
                                <option value="Tamil">Tamil</option>
                            </select>
                        </div>
                        <div style="flex:1;">
                            <label style="display:block;font-size:12px;margin-bottom:4px;">Target</label>
                            <select id="ai-translator-target" class="ai-translator-select">
                                <option value="English">English</option>
                                <option value="Chinese">Chinese</option>
                                <option value="Japanese">Japanese</option>
                                <option value="Korean">Korean</option>
                                <option value="Spanish">Spanish</option>
                                <option value="French">French</option>
                                <option value="German">German</option>
                                <option value="Hindi">Hindi</option>
                                <option value="Tamil">Tamil</option>
                            </select>
                        </div>
                    </div>
                </div>

                <div class="ai-translator-section ai-translator-controls">
                    <button class="ai-translator-btn" id="ai-translator-pick-btn">Pick Element</button>
                    <button class="ai-translator-btn" id="ai-translator-fullpage-btn" style="background:#6bbf73;">Translate Full Page</button>
                    <button class="ai-translator-btn" id="ai-translator-config-btn" style="background:#4a90e2;">API & Prompt</button>
                    <button class="ai-translator-btn" id="ai-view-saved-btn" style="background:#666;">View Saved</button>
                </div>

                <div class="ai-translator-section ai-translator-small-row">
                    <div style="display:flex;gap:6px;">
                        <button class="ai-translator-small-btn" id="ai-translator-reload-btn">↻ Reload</button>
                        <button class="ai-translator-small-btn" id="ai-clear-saved-btn">Clear Saved</button>
                        <button class="ai-translator-small-btn" id="ai-clear-cache-btn">Clear Cache</button>
                    </div>
                    <div class="ai-translator-footer">
                        <div class="ai-translator-mini" id="ai-translator-status">Ready.</div>
                        <div class="ai-translator-mini">v0.4</div>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(panelEl);

        const enabledCheckbox = panelEl.querySelector('#ai-translator-enabled');
        const sourceSelect = panelEl.querySelector('#ai-translator-source');
        const targetSelect = panelEl.querySelector('#ai-translator-target');
        const closeBtn = panelEl.querySelector('.ai-translator-close');
        const pickBtn = panelEl.querySelector('#ai-translator-pick-btn');
        const fullPageBtn = panelEl.querySelector('#ai-translator-fullpage-btn');
        const configBtn = panelEl.querySelector('#ai-translator-config-btn');
        const helpBtn = panelEl.querySelector('#ai-translator-help-btn');
        statusEl = panelEl.querySelector('#ai-translator-status');

        enabledCheckbox.checked = !!settings.enabled;
        sourceSelect.value = settings.sourceLang || 'auto';
        targetSelect.value = settings.targetLang || 'English';

        enabledCheckbox.addEventListener('change', () => {
            settings.enabled = enabledCheckbox.checked;
            saveSettings(settings);
            setStatus(settings.enabled ? 'Enabled.' : 'Disabled.');
        });

        sourceSelect.addEventListener('change', () => {
            settings.sourceLang = sourceSelect.value;
            saveSettings(settings);
        });

        targetSelect.addEventListener('change', () => {
            settings.targetLang = targetSelect.value;
            saveSettings(settings);
        });

        closeBtn.addEventListener('click', () => {
            panelEl.style.display = 'none';
        });

        pickBtn.addEventListener('click', () => {
            if (!settings.enabled) {
                setStatus('Enable the translator first.');
                return;
            }
            if (!settings.apiUrl || !settings.apiKey || !settings.model) {
                setStatus('Configure API URL, key, and model first.');
                openConfigModal();
                return;
            }
            startElementPicker();
        });

        fullPageBtn.addEventListener('click', () => {
            if (!settings.enabled) {
                setStatus('Enable the translator first.');
                return;
            }
            if (!settings.apiUrl || !settings.apiKey || !settings.model) {
                setStatus('Configure API URL, key, and model first.');
                openConfigModal();
                return;
            }
            if (confirm('Translate the visible text on the entire page? This will modify content in-place.')) {
                translateElement(document.body);
            }
        });

        configBtn.addEventListener('click', () => {
            openConfigModal();
        });

        helpBtn.addEventListener('click', () => {
            alert(
                'AI Element Translator\n\n' +
                '1. Configure your OpenAI-compatible endpoint, API key, and model.\n' +
                '2. Choose source/target languages.\n' +
                '3. Tap "Pick element to translate", then tap any element on the page.\n' +
                '4. The text inside will be translated and replaced in-place.\n\n' +
                'API must accept POST to the given URL with JSON body:\n' +
                '{ model, messages, temperature } like OpenAI /chat/completions.'
            );
        });

        // Extra controls added in redesigned UI
        const viewSavedBtn = panelEl.querySelector('#ai-view-saved-btn');
        const clearCacheBtn = panelEl.querySelector('#ai-clear-cache-btn');
        const clearSavedBtn = panelEl.querySelector('#ai-clear-saved-btn');
        const reloadBtn = panelEl.querySelector('#ai-translator-reload-btn');
        const providerBadge = panelEl.querySelector('#ai-provider-badge');
        const modelBadge = panelEl.querySelector('#ai-model-badge');

        function updateBadges() {
            if (providerBadge) providerBadge.textContent = settings.provider || '';
            if (modelBadge) modelBadge.textContent = settings.model || '';
        }

        updateBadges();

        if (viewSavedBtn) {
            viewSavedBtn.addEventListener('click', () => {
                const saved = loadSavedElements();
                const keys = Object.keys(saved || {});
                if (!keys.length) {
                    alert('No saved elements.');
                    return;
                }
                let msg = 'Saved elements:\n\n';
                keys.forEach(d => {
                    const s = saved[d];
                    msg += `${d}: selector=${s.selector||''}, xpath=${s.xpath||''}, snippet=${(s.snippet||'').slice(0,80)}\nlast: ${new Date(s.timestamp).toLocaleString()}\n\n`;
                });
                alert(msg);
            });
        }

        if (clearCacheBtn) {
            clearCacheBtn.addEventListener('click', () => {
                if (confirm('Clear translation cache?')) {
                    clearTranslationCache();
                    setStatus('Cache cleared.');
                }
            });
        }

        if (clearSavedBtn) {
            clearSavedBtn.addEventListener('click', () => {
                if (confirm('Clear all saved elements?')) {
                    saveSavedElements({});
                    setStatus('Saved elements cleared.');
                }
            });
        }

        if (reloadBtn) {
            reloadBtn.addEventListener('click', () => {
                location.reload();
            });
        }
    }

    function showPanel() {
        if (!panelEl) createPanel();
        panelEl.style.display = 'block';
    }

    function setStatus(msg) {
        if (!statusEl) return;
        statusEl.textContent = msg;
    }

    function openConfigModal() {
        const overlay = document.createElement('div');
        overlay.className = 'ai-translator-config-overlay';

        const modal = document.createElement('div');
        modal.className = 'ai-translator-config-modal';

        const currentProvider = settings.provider || 'groq';
        const providerConfig = PROVIDERS[currentProvider];

        modal.innerHTML = `
            <h2>API & Prompt Settings</h2>
            <p style="font-size:11px;opacity:0.8;">
                Select an AI provider or use a custom endpoint.
            </p>

            <label style="font-weight:600;margin-top:10px;">AI Provider</label>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:8px;">
                <label style="display:flex;align-items:center;gap:4px;cursor:pointer;font-weight:normal;">
                    <input type="radio" name="ai-provider" value="groq" ${currentProvider === 'groq' ? 'checked' : ''}>
                    Groq
                </label>
                <label style="display:flex;align-items:center;gap:4px;cursor:pointer;font-weight:normal;">
                    <input type="radio" name="ai-provider" value="openrouter" ${currentProvider === 'openrouter' ? 'checked' : ''}>
                    OpenRouter
                </label>
                <label style="display:flex;align-items:center;gap:4px;cursor:pointer;font-weight:normal;">
                    <input type="radio" name="ai-provider" value="gemini" ${currentProvider === 'gemini' ? 'checked' : ''}>
                    Gemini
                </label>
                <label style="display:flex;align-items:center;gap:4px;cursor:pointer;font-weight:normal;">
                    <input type="radio" name="ai-provider" value="custom" ${currentProvider === 'custom' ? 'checked' : ''}>
                    Custom
                </label>
            </div>

            <label>API URL (chat/completions endpoint)</label>
            <input type="text" id="ai-config-apiurl" value="${escapeHtml(settings.apiUrl || '')}" ${currentProvider !== 'custom' ? 'readonly' : ''}>
            <p style="font-size:10px;opacity:0.6;margin:2px 0 8px 0;" id="ai-provider-note"></p>

            <label>API Key (stored locally)</label>
            <input type="password" id="ai-config-apikey" value="${escapeHtml(settings.apiKey || '')}">

            <label>Model</label>
            <select id="ai-config-model" class="ai-translator-select">
                ${providerConfig.models.map(m => `<option value="${m}" ${settings.model === m ? 'selected' : ''}>${m}</option>`).join('')}
            </select>

            <label>Temperature</label>
            <input type="number" step="0.01" min="0" max="2" id="ai-config-temp" value="${Number(settings.temperature || 0.2)}">

            <label>System Prompt</label>
            <textarea id="ai-config-system">${escapeHtml(settings.systemPrompt || DEFAULT_SETTINGS.systemPrompt)}</textarea>

            <div class="ai-translator-config-actions">
                <button class="ai-translator-config-cancel">Cancel</button>
                <button class="ai-translator-config-save">Save</button>
            </div>
        `;

        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        // Update provider UI when radio changes
        const providerRadios = modal.querySelectorAll('input[name="ai-provider"]');
        const apiUrlInput = modal.querySelector('#ai-config-apiurl');
        const modelSelect = modal.querySelector('#ai-config-model');
        const noteEl = modal.querySelector('#ai-provider-note');

        function updateProviderUI() {
            const selected = modal.querySelector('input[name="ai-provider"]:checked').value;
            const provider = PROVIDERS[selected];
            
            apiUrlInput.value = provider.apiUrl || '';
            apiUrlInput.readOnly = selected !== 'custom';
            
            // Update model dropdown
            modelSelect.innerHTML = provider.models
                .map(m => `<option value="${m}">${m}</option>`)
                .join('');
            if (provider.models.length > 0) {
                modelSelect.value = provider.models[0];
            }
            
            // Show provider note if available
            if (provider.note) {
                noteEl.textContent = provider.note;
            } else {
                noteEl.textContent = '';
            }
        }

        providerRadios.forEach(radio => {
            radio.addEventListener('change', updateProviderUI);
        });

        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                document.body.removeChild(overlay);
            }
        });

        modal.querySelector('.ai-translator-config-cancel').addEventListener('click', () => {
            document.body.removeChild(overlay);
        });

        modal.querySelector('.ai-translator-config-save').addEventListener('click', () => {
            const provider = modal.querySelector('input[name="ai-provider"]:checked').value;
            const apiUrl = modal.querySelector('#ai-config-apiurl').value.trim();
            const apiKey = modal.querySelector('#ai-config-apikey').value.trim();
            const model = modal.querySelector('#ai-config-model').value.trim();
            const tempVal = parseFloat(modal.querySelector('#ai-config-temp').value);
            const systemPrompt = modal.querySelector('#ai-config-system').value;

            if (!apiUrl || !apiKey || !model) {
                alert('API URL, API key, and model are required.');
                return;
            }

            settings.provider = provider;
            settings.apiUrl = apiUrl;
            settings.apiKey = apiKey;
            settings.model = model;
            settings.temperature = isNaN(tempVal) ? 0.2 : tempVal;
            settings.systemPrompt = systemPrompt || DEFAULT_SETTINGS.systemPrompt;

            saveSettings(settings);
            document.body.removeChild(overlay);
            setStatus('Config saved.');
        });
    }

    function escapeHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    function openSavedElementSuggestion(domain, savedData) {
        const overlay = document.createElement('div');
        overlay.className = 'ai-translator-config-overlay';

        const modal = document.createElement('div');
        modal.className = 'ai-translator-config-modal';
        modal.style.maxWidth = '300px';

        const savedDate = new Date(savedData.timestamp);
        const dateStr = savedDate.toLocaleDateString() + ' ' + savedDate.toLocaleTimeString();

        modal.innerHTML = `
            <h2>Translate on this domain?</h2>
            <p style="font-size:11px;opacity:0.8;">
                You have a saved translation target for <strong>${escapeHtml(domain)}</strong>
                (last used: ${escapeHtml(dateStr)})
            </p>
            <p style="font-size:11px;opacity:0.7;margin:8px 0;">
                Would you like to start translating the same element now?
            </p>
            <div class="ai-translator-config-actions">
                <button class="ai-translator-config-cancel" id="ai-skip-btn">Skip</button>
                <button class="ai-translator-config-save" id="ai-translate-btn">Translate Now</button>
            </div>
        `;

        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        const closeModal = () => {
            if (overlay.parentNode) document.body.removeChild(overlay);
        };

        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                closeModal();
            }
        });

        modal.querySelector('#ai-skip-btn').addEventListener('click', () => {
            closeModal();
        });

        modal.querySelector('#ai-translate-btn').addEventListener('click', () => {
            closeModal();
            const el = findElementFromSaved(savedData);
            if (el) {
                console.log('[AI Translator] Found saved element, translating...');
                translateElement(el);
            } else {
                setStatus('Could not find the previously saved element.');
                console.warn('[AI Translator] Could not find element for saved data:', savedData);
            }
        });
    }

    // ---------- Element Picker ----------

    let picking = false;
    let lastHoverEl = null;

    function startElementPicker() {
        if (picking) return;
        picking = true;
        setStatus('Tap an element to translate (or tap again to cancel).');
        document.addEventListener('mouseover', onHover, true);
        document.addEventListener('mouseout', onUnhover, true);
        document.addEventListener('click', onPickClick, true);
    }

    function stopElementPicker() {
        if (!picking) return;
        picking = false;
        setStatus('Ready.');
        if (lastHoverEl) {
            lastHoverEl.classList.remove('ai-translator-highlight');
            lastHoverEl = null;
        }
        document.removeEventListener('mouseover', onHover, true);
        document.removeEventListener('mouseout', onUnhover, true);
        document.removeEventListener('click', onPickClick, true);
    }

    function onHover(e) {
        if (!picking) return;
        const el = e.target;
        if (el === document.body || el === document.documentElement || panelEl && panelEl.contains(el)) {
            return;
        }
        if (lastHoverEl && lastHoverEl !== el) {
            lastHoverEl.classList.remove('ai-translator-highlight');
        }
        lastHoverEl = el;
        el.classList.add('ai-translator-highlight');
    }

    function onUnhover(e) {
        if (!picking) return;
        const el = e.target;
        if (el === lastHoverEl) {
            el.classList.remove('ai-translator-highlight');
            lastHoverEl = null;
        }
    }

    function onPickClick(e) {
        if (!picking) return;
        e.preventDefault();
        e.stopPropagation();

        const el = e.target;
        if (panelEl && panelEl.contains(el)) {
            // Clicked panel -> ignore / cancel
            stopElementPicker();
            return;
        }

        stopElementPicker();
        
        // Save this element for the current domain (store css selector + xpath + text snippet)
        const domain = getCurrentDomain();
        const xpath = getElementXPath(el);
        const selector = getCssSelector(el) || el.className || '';
        const snippet = getFirstTextSnippet(el);
        saveElementForDomain(domain, selector, xpath, snippet);
        console.log('[AI Translator] Saved element for domain:', domain, { selector, xpath, snippet });

        translateElement(el);
    }

    // ---------- Text Node Handling ----------

    function collectTextNodes(root) {
        const walker = document.createTreeWalker(
            root,
            NodeFilter.SHOW_TEXT,
            {
                acceptNode(node) {
                    if (!node.nodeValue) return NodeFilter.FILTER_REJECT;
                    const parent = node.parentElement;
                    if (!parent) return NodeFilter.FILTER_REJECT;
                    const tag = parent.tagName && parent.tagName.toUpperCase();
                    // Skip script/style/noscript and inputs
                    if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT' || tag === 'TEXTAREA' || tag === 'INPUT') return NodeFilter.FILTER_REJECT;
                    // Skip hidden elements
                    try {
                        const cs = window.getComputedStyle(parent);
                        if (cs && (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0')) return NodeFilter.FILTER_REJECT;
                    } catch (e) {
                        // ignore
                    }
                    const text = node.nodeValue.replace(/\s+/g, ' ').trim();
                    if (!text) return NodeFilter.FILTER_REJECT;
                    return NodeFilter.FILTER_ACCEPT;
                }
            },
            false
        );

        const nodes = [];
        let current;
        while ((current = walker.nextNode())) {
            nodes.push(current);
        }
        return nodes;
    }

    function buildSegmentedText(nodes) {
        return nodes.map((node, idx) => {
            return `__SEG_${idx}__ ${node.nodeValue}`;
        }).join('\n');
    }

    function parseSegmentedResponse(text, nodeCount) {
        const map = {};
        // Match segments that span multiple lines
        // Pattern: __SEG_N__ followed by everything until the next marker or end
        const segmentPattern = /__SEG_(\d+)__\s*([\s\S]*?)(?=__SEG_\d+__|$)/g;
        let match;
        
        while ((match = segmentPattern.exec(text)) !== null) {
            const idx = parseInt(match[1], 10);
            let translated = match[2];
            
            // Remove trailing newline if the content spans multiple lines
            if (translated.endsWith('\n')) {
                translated = translated.slice(0, -1);
            }
            
            if (!isNaN(idx)) {
                map[idx] = translated;
            }
        }

        const result = [];
        for (let i = 0; i < nodeCount; i++) {
            // Use null for unmapped segments so we can skip them
            result.push(map[i] !== undefined ? map[i] : null);
        }
        return result;
    }

    // ---------- API Call ----------

    function callTranslationAPI(segmentedText) {
        return new Promise((resolve, reject) => {
            // Check cache first
            try {
                const cache = loadTranslationCache();
                if (cache && cache[segmentedText]) {
                    console.log('[AI Translator] Using cached translation');
                    resolve(cache[segmentedText]);
                    return;
                }
            } catch (e) {
                console.warn('[AI Translator] Cache check failed', e);
            }
            const src = settings.sourceLang || 'auto';
            const tgt = settings.targetLang || 'English';
            const sysPrompt = (settings.systemPrompt || DEFAULT_SETTINGS.systemPrompt)
                .replace(/SOURCE_LANG/g, src)
                .replace(/TARGET_LANG/g, tgt);

            const body = {
                model: settings.model,
                messages: [
                    { role: 'system', content: sysPrompt },
                    { role: 'user', content: segmentedText }
                ],
                temperature: typeof settings.temperature === 'number' ? settings.temperature : 0.2
            };

            GM_xmlhttpRequest({
                method: 'POST',
                url: settings.apiUrl,
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + settings.apiKey
                },
                data: JSON.stringify(body),
                onload: function (res) {
                    try {
                        if (res.status < 200 || res.status >= 300) {
                            console.error('[AI Translator] HTTP error', res.status, res.responseText);
                            reject(new Error('HTTP ' + res.status));
                            return;
                        }
                        const json = JSON.parse(res.responseText);
                        const content = json.choices && json.choices[0] && json.choices[0].message && json.choices[0].message.content;
                        if (!content) {
                            reject(new Error('No content in response.'));
                            return;
                        }
                        const trimmed = content.trim();
                        // Save to cache
                        try {
                            const cache = loadTranslationCache();
                            cache[segmentedText] = trimmed;
                            saveTranslationCache(cache);
                        } catch (e) {
                            console.warn('[AI Translator] Failed to save translation to cache', e);
                        }
                        resolve(trimmed);
                    } catch (err) {
                        console.error('[AI Translator] Response parse error', err);
                        reject(err);
                    }
                },
                onerror: function (err) {
                    console.error('[AI Translator] Request error', err);
                    reject(new Error('Network error'));
                }
            });
        });
    }

    // ---------- Translation Flow ----------

    async function translateElement(rootEl) {
        try {
            setStatus('Collecting text nodes…');

            const textNodes = collectTextNodes(rootEl);
            if (!textNodes.length) {
                setStatus('No text found in this element.');
                return;
            }

            console.log('[AI Translator] Found', textNodes.length, 'text nodes');

            const segmented = buildSegmentedText(textNodes);
            console.log('[AI Translator] Segmented text:', segmented);
            setStatus('Sending to AI…');

            const responseText = await callTranslationAPI(segmented);
            console.log('[AI Translator] Response from AI:', responseText);
            setStatus('Received response. Applying…');

            const translations = parseSegmentedResponse(responseText, textNodes.length);
            let replacedCount = 0;
            let failedCount = 0;

            translations.forEach((translated, idx) => {
                if (translated !== null && translated !== undefined) {
                    // For multi-line content, preserve the structure but trim excess whitespace
                    let finalText = translated;
                    if (textNodes[idx].nodeValue.includes('\n')) {
                        // Original had newlines, keep them but trim extra whitespace
                        finalText = translated.trim();
                    } else {
                        // Single-line content, trim trailing space only
                        finalText = translated.trimEnd();
                    }
                    
                    if (finalText !== '') {
                        const oldText = textNodes[idx].nodeValue;
                        textNodes[idx].nodeValue = finalText;
                        console.log(`[AI Translator] SEG_${idx}: "${oldText}" → "${finalText}"`);
                        replacedCount++;
                    } else {
                        failedCount++;
                        console.warn(`[AI Translator] SEG_${idx}: Translation is empty after trimming`);
                    }
                } else {
                    failedCount++;
                    console.warn(`[AI Translator] SEG_${idx}: No translation received`);
                }
            });

            setStatus(`Done. Updated ${replacedCount}/${textNodes.length} text nodes.`);
            if (failedCount > 0) {
                console.warn(`[AI Translator] ${failedCount} segments failed to translate`);
            }
        } catch (err) {
            console.error('[AI Translator] Error translating element:', err);
            setStatus('Error: ' + (err && err.message ? err.message : 'Unknown error'));
        }
    }

    // ---------- Tampermonkey Menu ----------

    GM_registerMenuCommand('Show/Hide AI Translator Panel', () => {
        if (!panelEl) {
            showPanel();
        } else {
            panelEl.style.display = (panelEl.style.display === 'none' ? 'block' : 'none');
        }
    });

    GM_registerMenuCommand('Clear API Key (AI Translator)', () => {
        if (confirm('Clear stored API key for AI Translator?')) {
            settings.apiKey = '';
            saveSettings(settings);
            alert('API key cleared.');
        }
    });

    GM_registerMenuCommand('Clear Saved Elements (AI Translator)', () => {
        if (confirm('Clear all saved translation targets for all domains?')) {
            saveSavedElements({});
            alert('All saved elements cleared.');
        }
    });

    GM_registerMenuCommand('Clear Translation Cache (AI Translator)', () => {
        if (confirm('Clear the translation cache?')) {
            clearTranslationCache();
            alert('Translation cache cleared.');
        }
    });

    GM_registerMenuCommand('View Saved Elements (AI Translator)', () => {
        const saved = loadSavedElements();
        const domains = Object.keys(saved);
        if (domains.length === 0) {
            alert('No saved translation targets yet.');
            return;
        }
        
        let msg = 'Saved translation targets:\n\n';
        domains.forEach(domain => {
            const data = saved[domain];
            const date = new Date(data.timestamp).toLocaleDateString();
            msg += `• ${domain} (${date})\n`;
        });
        alert(msg);
    });

    // ---------- Init ----------

    // Show panel on first load; can be hidden later
    showPanel();

    // Check for saved element on page load
    setTimeout(() => {
        if (settings.enabled) {
            const domain = getCurrentDomain();
            const saved = getSavedElementForDomain(domain);
            if (saved) {
                console.log('[AI Translator] Found saved element for domain:', domain);
                openSavedElementSuggestion(domain, saved);
            }
        }
    }, 500);
})();
