// ==UserScript==
// @name         WTR-Lab Smart Fluid Container
// @namespace    http://tampermonkey.net/
// @version      1.1
// @description  Calculates device width dynamically and overrides Bootstrap static steps
// @author       deva-hari
// @match        https://wtr-lab.com/*
// @match        https://www.wtr-lab.com/*
// @grant        GM_addStyle
// @run-at       document-start
// ==/UserScript==

(function() {
    'use strict';

    // --- Configuration ---
    // The total whitespace (margins) you want on the sides of the screen (in pixels).
    const TOTAL_GUTTER = 20;
    // Minimum width to trigger the smart adjustment (prevents issues on very small mobile)
    const MIN_TRIGGER_WIDTH = 576;

    // --- 1. Inject Base CSS using CSS Variables ---
    // We use a CSS variable (--smart-width) so we can update the value
    // via JS without constantly rewriting the <style> tag.
    const cssOverride = `
        @media (min-width: ${MIN_TRIGGER_WIDTH}px) {
            .container, .container-md, .container-sm {
                max-width: var(--smart-width, 100%) !important;
                transition: max-width 0.1s ease-out; /* Smooth resizing */
            }
        }
    `;
    GM_addStyle(cssOverride);

    // --- 2. Smart Calculation Logic ---
    function updateContainerWidth() {
        const viewportWidth = window.innerWidth;

        // If we are below our trigger point, let Bootstrap handle it standard mobile view
        if (viewportWidth < MIN_TRIGGER_WIDTH) return;

        // Calculate: Viewport - Gutter
        // This makes it "Smart" (Fluid) rather than "Stepped" (Static)
        const newWidth = viewportWidth - TOTAL_GUTTER;

        // Apply to the document root
        document.documentElement.style.setProperty('--smart-width', `${newWidth}px`);
    }

    // --- 3. Performance Observer ---
    // Using ResizeObserver is more performant than window.addEventListener('resize')
    // as it fires efficiently only when dimensions actually change.
    const observer = new ResizeObserver((entries) => {
        // We wrap in requestAnimationFrame to prevent "ResizeObserver loop limit" errors
        window.requestAnimationFrame(() => {
            updateContainerWidth();
        });
    });

    // Start observing the body
    observer.observe(document.body);

    // Initial calculation
    updateContainerWidth();

})();