# MWI XP Planner

A web-based experience planner for Milky Way Idle. Calculates leveling times, projections, and cross-progress between Primary and Charm.

Live site: https://ignantgaming.github.io/MWI_XP_Planner/

---

## Features

- Primary + Charm calculators (Magic/Melee/Range and Stamina/Intelligence/Attack/Defense)
- Time-to-next, simulated progress over N hours, time-to-target
- Cross projection: whichever side has the target, the other side projects to the same time budget
- Uses `experience.json` (levels up to 200)

---

## File Structure

- `index.html` – UI markup
- `app.js` – core logic and UI behavior
- `styles.css` – styles and theme
- `experience.json` – XP thresholds per level
- `mwi-xp-planner.user.js` – Tampermonkey/Greasemonkey userscript

---

## Tampermonkey Userscript

File: `mwi-xp-planner.user.js`

Install
- In Tampermonkey: Create a new script, paste the file contents, Save.
- Or drag-drop the file into the Tampermonkey dashboard to import.

Usage on milkywayidle.com
- Use “Save MWI → Tag” to store a snapshot of combat skills.
- Click “Open Tag in Planner” to open the planner with the data embedded via `#cs=...`.

Planner behavior
- A “Player Skills (imported)” table appears under the header.
- New buttons: “Autofill from imported” in Primary and Charm panels copy the imported level and XP-to-next into the form and recalculate.

---

## Local Development

- Serve locally (to allow fetch of `experience.json`):
  - `npx serve -l 8080 .` or `python -m http.server 8080`
  - Open `http://localhost:8080/`
- If opening `index.html` from the file system, use the file picker banner to load `experience.json` when fetch is blocked.

Notes
- `experience.json` includes level 200 to enable 199→200 deltas.
