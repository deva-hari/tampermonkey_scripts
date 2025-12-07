# WTR-Lab Smart Fluid Container

File: `WTR-Lab Smart Fluid Container.user.js`

Purpose

This Tampermonkey script calculates a "smart" container width based on the current viewport and a configurable gutter value, then applies that width to Bootstrap container classes using a CSS variable. The intent is to make layout fluid while preserving gutters.

How to open settings

- Tampermonkey menu: Click the Tampermonkey icon → find the `WTR-Lab Smart Fluid Container` entry → click `⚙️ Settings`.
- Hotkey: Press `Shift + S` while on the page to toggle the settings panel.

UI behavior

- The settings panel is dark-themed and appears in the top-right of the page when visible.
- The `Enable/Disable Feature` button toggles whether the script injects its CSS and applies the CSS variable.
- When the feature is disabled, the script removes the injected style element and clears the CSS variable so the site uses its default styles.

Storage keys and defaults

- `wtr_lab_smart_container_settings_totalGutter` (stored as `${STORAGE_KEY}_totalGutter` in code) — default: `20` px
- `wtr_lab_smart_container_settings_minTriggerWidth` (stored as `${STORAGE_KEY}_minTriggerWidth`) — default: `576` px
- `wtr_lab_smart_container_settings_enabled` (stored as `${STORAGE_KEY}_enabled`) — default: `true`
- `wtr_lab_smart_container_settings_uiVisible` (stored as `${STORAGE_KEY}_uiVisible`) — default: `false`

Notes for developers

- The script uses `GM_registerMenuCommand('⚙️ Settings', ...)` to expose the menu item in Tampermonkey.
- The UI element id is `wtr-smart-container-panel`.
- The style element id for injected CSS is `wtr-container-css` — when disabling the feature the script removes this element.
- To modify defaults, edit constants near the top of the script (`DEFAULT_TOTAL_GUTTER`, `DEFAULT_MIN_TRIGGER_WIDTH`).

Troubleshooting

- If the panel does not appear after selecting the menu item:
  - Ensure the script is enabled in Tampermonkey and the page has finished loading.
  - Reload the page and try `Shift + S` to toggle the panel.
  - Inspect the page for `#wtr-smart-container-panel` in DevTools to confirm the element exists.
