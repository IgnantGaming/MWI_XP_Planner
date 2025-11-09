# Repository Guidelines

## Project Structure & Module Organization
- `index.html` – UI markup and layout.
- `app.js` – Core logic (XP table load, UI events, projections).
- `styles.css` – Theme and component styles.
- `experience.json` – XP thresholds per level (fetched by the app).
- `mwi-xp-planner.user.js` – Userscript variant (Tampermonkey/Greasemonkey).
- `README.md`, `LICENSE` – Docs and license. No build step; static site.

## Build, Test, and Development Commands
- Serve locally (recommended for `experience.json` fetch):
  - `npx serve -l 8080 .` or `python -m http.server 8080`
  - Open `http://localhost:8080/`.
- Open from file system: `index.html` works; if fetch fails, use the file picker to load `experience.json`.

## Coding Style & Naming Conventions
- JavaScript: 2-space indent, semicolons, single quotes, `camelCase` for variables/functions.
- Files: keep root files in `kebab-case` where applicable.
- Keep JS modular via small pure helpers; avoid introducing frameworks/build tools without discussion.
- Prefer DOM APIs and clear function names mirroring UI labels (e.g., `renderImportedTable`).

## Testing Guidelines
- No test runner is configured. For changes, validate in a browser:
  - Theme toggle, XP table load (via fetch and via file picker), URL-hash import (`#cs=`), projections.
  - Check DevTools console for errors.
- For substantial logic, add small, pure functions in `app.js` and cover with ad-hoc console checks; propose a lightweight test setup (e.g., Vitest) in a separate PR if needed.

## Commit & Pull Request Guidelines
- Use Conventional Commits (e.g., `feat: add charm projection note`, `fix: handle missing xp rows`).
- PRs: concise description, linked issue, before/after screenshots or GIF for UI; include manual test steps and browsers tested.
- Keep diffs focused and avoid unrelated formatting churn.

## Security & Configuration Tips
- Do not commit secrets. The app fetches local `experience.json`; serve from same origin to avoid CORS issues.
- Userscript: scope match patterns narrowly; avoid collecting or transmitting user data.

