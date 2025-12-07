# Tampermonkey Scripts — Documentation

This `docs/` folder contains per-script READMEs and a short root index linking to them.

- [WTR-Lab Smart Fluid Container](./docs/wtr-lab-smart-fluid-container.md) — Adjusts Bootstrap container widths dynamically with configurable UI.
- [Instagram Unfollow Helper](./docs/instagram-unfollow-helper.md) — Automates safe unfollow runs with configurable delays and options.

Quick notes

- Files live in the repository root: `WTR-Lab Smart Fluid Container.user.js` and `Instagram Unfollow Helper.user.js`.
- Both scripts register a Tampermonkey menu command named `⚙️ Settings` to open the script-specific settings panel.
- You can also toggle the settings panel with the hotkey `Shift + S` (when the page has focus).

Usage

1. Install the script into Tampermonkey (via the `*.user.js` file or the `downloadURL` in the script header).
2. Click the Tampermonkey icon and open the script entry; choose `⚙️ Settings` in the dropdown to open the configuration panel.
3. Change settings, then use the on-panel controls to save/reset. Settings are persisted using Tampermonkey storage (`GM_getValue` / `GM_setValue`).

Support / Notes

- If the settings panel doesn't appear, ensure the script is enabled and reload the page.
- For `WTR-Lab Smart Fluid Container`, disabling the feature removes the injected CSS so the site returns to default Bootstrap behavior.
- For details about keys, defaults and UI options, open the linked per-script README files.
