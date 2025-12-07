# Instagram Unfollow Helper

File: `Instagram Unfollow Helper.user.js`

Purpose

This script automates unfollow runs on Instagram with configurable limits, randomized delays, optional auto-scrolling, and a "dry-run" mode for safe testing.

How to open settings

- Tampermonkey menu: Click the Tampermonkey icon → find the `Instagram Unfollow Helper` entry → click `⚙️ Settings`.
- Hotkey: Press `Shift + S` while on the page to toggle the settings panel.

Key settings and defaults

- `unfollowLimit` — default: `25` (number of unfollows per run)
- `minDelay` — default: `2500` (ms)
- `maxDelay` — default: `5500` (ms)
- `autoScroll` — default: `true`
- `dryRun` — default: `false` (when true, actions are simulated)
- `skipKeywords` — default: `''` (comma-separated list of keywords to skip)
- `runCount` — default: `1`
- `intervalMinutes` — default: `20`
- `scrollPx` — default: `900` (pixels per scroll)

Storage

- Settings are saved via Tampermonkey storage (`GM_getValue` / `GM_setValue`) under the keys used in the script (e.g., `unfollowLimit`, `minDelay`, etc.).

UI

- The panel id is `ig-unfollow-panel` and uses dark styling.
- Buttons include `Start`, `Stop`, `Test scroll`, and toggles for `Dry-run` / `Auto-scroll`.

Developer notes

- The script registers the Tampermonkey menu command `⚙️ Settings` via `GM_registerMenuCommand`.
- Use DevTools to inspect `#ig-unfollow-panel` if the menu command doesn't surface the UI.
