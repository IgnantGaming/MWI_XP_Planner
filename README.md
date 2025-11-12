# MWI XP Planner

Plan and project leveling for Milky Way Idle. Enter your Primary and Charm details, set a target, and see time‑to‑next, multi‑hour projections, and cross‑projections. With the userscript, your current skills, equipment, and live XP/hour import automatically from the game.

Live site: https://ignantgaming.github.io/MWI_XP_Planner/

[Install Userscript on GreasyFork](https://greasyfork.org/en/scripts/555252-mwi-xp-planner)

---

## Features

- Primary + Charm calculators (Magic/Melee/Range and Stamina/Intelligence/Attack/Defense)
- Time‑to‑next, simulated progress over N hours, time‑to‑target
- Cross projection: whichever side has the target, the other side projects to the same time budget
- Imports skills, equipment, and live XP/hour via userscript
- Uses `experience.json` (levels up to 200)

---

## File Structure

- `index.html` – UI markup
- `app.js` – core logic and UI behavior
- `styles.css` – styles and theme
- `experience.json` – XP thresholds per level
- `mwi-xp-planner.user.js` – Tampermonkey/Greasemonkey userscript

---

## Userscript (Tampermonkey)

File: `mwi-xp-planner.user.js`

- Install from GreasyFork: https://greasyfork.org/en/scripts/555252-mwi-xp-planner
- Or import the file manually into Tampermonkey.

On the game site (milkywayidle.com):
- “Save MWI → Tag” stores a tagged snapshot of your combat skills (with equipment + rates).
- For 5 minutes, “Open <tag> in Planner” appears; click to open the planner with `#cs=` payload embedded.
- Live XP/hour is computed from battle messages; change charms to see cType/cRate update.

On the planner site:
- When data is imported, “Player Skills (imported)” appears; inputs are auto‑filled.
- If a charm is detected, “Target Applies To” defaults to Charm and Target Level defaults to the next multiple of 5 above the charm’s level.

---

## Local Development

- Serve locally (to allow fetch of `experience.json`):
  - `npx serve -l 8080 .` or `python -m http.server 8080`
  - Open `http://localhost:8080/`
- If opening `index.html` from the file system, use the file picker banner to load `experience.json` when fetch is blocked.
- Modify mwi-xp-planner.user.js:
  - //const PLANNER_URL = 'https://ignantgaming.github.io/MWI_XP_Planner/';
  - const PLANNER_URL = 'http://localhost:8080/';

## Manual Usage (without userscript)

1) Open the planner site.
2) Enter Primary and Charm:
   - Class, Current Level, XP Needed to Next Level, and XP per Hour.
3) Set Simulate Hours and the Target Level.
4) Choose “Target Applies To” (Primary or Charm) and click Calculate.

Tips
- `experience.json` includes level 200 to enable 199→200 deltas.
- If your browser blocks `experience.json` fetch (file://), use the file picker banner to load it.
