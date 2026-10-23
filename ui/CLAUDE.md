# UI

Loaded automatically when a chat works with files under `ui/`. Rules, token names, components and the screen → files → boards map for the UI.

Plain ES modules served from `ui/`, no build, no framework. Screens render into `#view`, re-render through `app.render()`, and all server calls go through `ui/js/api.js`.
Click handlers are `data-action` attributes handled in `ui/js/actions.js`. Find a function's file and line in `docs/CODEMAP.md`.

## Rules
- Tokens only: every color, font, space, radius and shadow is a `var(--…)` (names below). No hex, rgb or named colors in CSS or JS.
- Use the design system's `jp-` classes (`ui/styles/components.css`) and the helpers in `ui/styles/app.css`; new shared pieces go in `ui/js/components/`.
- Status always pairs color with a word (`statusPill`, `jp-callout` with text). Never color alone.
- One primary action (`jp-btn--primary`) per region; others are default, tinted or plain.
- Theme: Mocha (`.jp-mocha`) by default, Latte (`.jp-latte`) on `<html>`; follows the system until the user flips the switch in More.
- No emoji; icons are the 1.5px line set in `ui/js/util.js` `icon()`. Sentence case. Text written from the user's side; never raw status names.
- Phones: `styles/phone.css` loads last; touch-only sizes go under `@media (pointer: coarse)` so desktop stays compact. Check new screens at 375 px.
  App icons: `node tools/gen-icons.mjs` writes `ui/icons/` (manifest: `ui/manifest.webmanifest`).
- Keep each file under ~300 lines; add a module rather than growing one. New files under `ui/` need no registration.
- After editing `design/tokens.json`, run `node design/gen-tokens.mjs` (writes `ui/styles/tokens.css`). Never read either file to learn names: use the list below.

## Token names
- Grounds: `--canvas` (page) `--surface` (cards, sheets) `--surface-hover` `--fill` (controls) `--fill-strong` `--mantle` `--material` + `--material-blur` (top bar) `--scrim`.
- Lines: `--separator` (hairlines inside cards) `--control-border` `--focus-ring`.
- Text: `--text` `--text-secondary` `--text-tertiary` `--link`.
- Accent (Mauve, the only one): `--accent` (fills, rings) `--accent-text` `--accent-soft` `--on-accent`.
- States, each with `-text` and `-soft`: `--success` `--warning` `--serious` `--danger`; `--info` + `--info-soft` (its text stays `--text`).
- Charts: `--chart-track` `--chart-muted`. Switch knob: `--knob`.
- Type: `--font-display` `--font-sans` `--font-mono` (scores and counts, tabular). Space: `--space-1…6,8,10` (4px grid).
- Radius: `--radius-xs` chips, `-sm` fields, `-md` rows/callouts, `-lg` cards, `-xl` sheets, `-pill` buttons and pills. Shadows: `--shadow-card` `--shadow-float` `--shadow-thumb`.
- Raw palette `--ctp-*` only when no role fits.

## Components (`ui/js/components/`)
`score-ring` `status-pill` (`STATUS`) `tag` `list-row` `card` (+ callout) `sheet` (slide-over, or `center: true` dialog) `company-logo` `drop` (drag-and-drop files)
`loading` (`loadingHtml(kind, what)` skeleton: split | three | page, slow line after 4 s in CSS; `loadFailedHtml(error, what, action)` with Try again) `coach-text` (Claude's text + `[[job:|resume:|repo:|todo:id|label]]` links). Style classes: `jp-btn` (`--primary --tinted --plain --danger --sm --lg`), `jp-seg`, `jp-pill--*`,
`jp-tag` (`--met --missing`), `jp-card`, `jp-list` + `jp-row`, `jp-ring`, `jp-field` + `jp-input`, `jp-callout` (`--warning --danger`), `jp-bar`.

## Screens → files → canvas boards
Canvas: https://claude.ai/artifact/QN4L8Dp21549eHZrEzfudZ (boards are `project/<Board>.dc.html`, 20–70 KB each). Every screen is built, so read a board
only when designing new UI for that screen, one board at a time, never canvas.json or the canvas's reference files.

| Screen | Files | Boards |
|---|---|---|
| Shell: top bar, run status, Ask Claude, More | `ui/index.html`, `js/shell.js` (+ `PHASE`), `components/sheet.js` | Main |
| Jobs (list + detail) | `screens/jobs/`: `index` `model` `list` `detail` `detail-cards` `posting` `ask`; `styles/jobs.css` | Main, A-Latte, A-Posting, A-Group, JobDetail |
| Job statuses, problem states | `screens/jobs/track.js` (`shown`, timeline, `runProblem`) `problems.js` `review.js` `detail.js` (`PRIMARY`), `components/status-pill.js` | Jobs-Applied, Jobs-Approve, Jobs-LoggedOut, Jobs-RunFailed, Jobs-Limited, Jobs-FirstDay, Settings-Review |
| Guidance | `screens/guidance/`: `index` `model` `list` `chat` `context` `interview` `act`; `styles/guidance.css` | Guidance, Guidance-Interview |
| Resumes | `screens/resumes/`: `index` `model` `list` `detail` (+ "Ask Claude to change this resume") `history` `answers` `upload` `reupload` (re-upload and instruction check) `rules` (Your resume rules: rules, photo, file names, re-tailor) `projects` (GitHub projects) `photo` (crop) `menu` (row menu: right-click, ⋯, Shift+F10) `manage` (rename/delete sheets) `prefs-actions`; `styles/resumes.css` | Resumes, Resumes-Original, -Answers, -Reupload, -Upload, -Latte |
| Insights | `screens/insights/`: `index` `model` (`todoFor()` feeds the Jobs raise card) `pipeline` `todo` `gaps` `market` `github`; `styles/insights.css` | Insights, Insights-Todo, -Gaps, -Market, -GitHub, -Latte, -Latte-Todo |
| Settings | `screens/settings/`: `index` (`data-set`/`data-pset` fields save on change) `profiles` `profile-sheets` `applying` `never` `schedule` `remote` (Phone access) `notifications` `privacy` `usage` `usage-controls`; `styles/settings.css` | Settings, Settings-Applying, -Review, -Never, -Latte, -Schedule, -Notifications, -Privacy, -Usage |
| Onboarding | `screens/onboarding/`: `index` `steps`; `styles/onboarding.css` | Onboarding, Onboarding-Profile |
| Activity | `screens/activity/`: `index` `model` `view`; `styles/activity.css`; server `activity.mjs`, `activity_routes.mjs` | Activity, Activity-Stopped |
| Doctor | `screens/doctor/`: `index` `checks` `history`; `styles/activity.css`; server `doctor_checks.mjs`, `doctor.mjs` `undoReport()` | Doctor |

B-Board, C-Grid and C-Sheet are rejected alternative layouts: never use them.

## Checking UI changes cheaply
- Run a test copy: `PORT=<free port> node server.mjs --no-open` (check the port is free first; old test servers may hold 4519/4521).
- Stub `/api/run` and `/api/send` in the page before clicking anything.
- Verify with `get_page_text`, `read_page` or a small `javascript_tool` check (element exists, text, computed style). Read console errors.
- Screenshots: at most 3 per task, at scale 0.5, at the end, for the screens touched; switch Latte with `document.documentElement.classList` and wait 300 ms (buttons animate).
