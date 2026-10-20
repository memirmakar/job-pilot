# Job Pilot

Local Windows app that searches LinkedIn daily (Playwright + Edge), has the user's Claude Code CLI pick, score and tailor
resumes for each job, applies via Easy Apply where allowed, and explains every decision in a local web UI. See README.md for the user's view.

**Rule for every session: read this file first, open only the files and canvas boards the task needs, and commit at the end.**

## Run and test
- App: `node server.mjs` (opens http://127.0.0.1:4510). `PORT=4519 node server.mjs --no-open` runs a second copy for testing.
- Install for users is `Install.cmd` only: no build step, no bundler, no framework. The UI is plain files served from `ui/`.
- Checks: `node --check <file>` on every edited `.mjs`/`.js`; `node apply.mjs selftest` checks LinkedIn can be read.
- Never start a real run while working on the UI ("Run now" submits real applications). Stub `/api/run` in the browser, or use
  `node apply.mjs run --dry-run --limit 2`. Any test that filters or processes job applications uses at most 5.
- Click through every screen touched (and the shell) in Mocha and Latte, at desktop and phone width, with the console open.

## Folder map
| Path | What |
|---|---|
| `server.mjs` | HTTP server: `/api/*` routes, `/pdf`, and static files from `ui/` |
| `apply.mjs` | CLI entry (`run`, `login`, `library`, `review`, `github`, `selftest`, `doctor`) |
| `pipeline.mjs` `linkedin.mjs` `llm.mjs` | daily run, LinkedIn DOM logic, Claude calls |
| `store.mjs` `config.mjs` | records, CSV log and run status; settings/profile loading |
| `conversations.mjs` | Ask Claude about a job: builds the job context, calls `llm.mjs` `ask()`, saves `data/conversations/` |
| `library.mjs` `market.mjs` `github.mjs` `doctor.mjs` `resume_pdf.mjs` | ready resumes, market review, GitHub review, self-repair, PDF rendering |
| `resumes.mjs` `reupload.mjs` `resume_read.mjs` `resume_routes.mjs` | Resumes screen: listing with versions, staged uploads and new versions, Claude reading/checking resume files, `/api/resumes/*` routes |
| `answers.mjs` `docx.mjs` | standard answers (keys, migration out of facts, prompt text); `.docx` export and reading back (Node zlib only) |
| `ui/index.html` | shell markup (top bar), loads the CSS and `js/main.js` |
| `ui/styles/` | `tokens.css` (generated), `components.css` (design-system bundle, copy), `app.css` (canvas helpers + shell), `jobs.css` (Jobs screen), `resumes.css` (Resumes screen), `legacy.css` (old screens) |
| `ui/js/` | `main.js` boot · `api.js` every server call · `state.js` data + view state · `router.js` sections · `shell.js` top bar · `actions.js` all `data-action` handlers · `theme.js` · `util.js` · `legacy.js` old widgets |
| `ui/js/components/` | `score-ring` `status-pill` `tag` `list-row` `card` (+ callout) `sheet` (slide-over, or `center: true` dialog) `company-logo` `drop` (drag-and-drop files) |
| `ui/js/screens/` | one file per screen, or a folder for big ones (`jobs/`); table below |
| `design/` | `tokens.json` (from the design system) and `gen-tokens.mjs` → `ui/styles/tokens.css` |

## Data files (all git-ignored)
- `data/applications/<site>-<id>.json`, one per job: `title company location url status statusReason createdAt submittedAt description field easyApply externalUrl postedAt postedText applicants logoUrl selection{reason}`,
  `ats{best_score best_file summary resumes[{file ats_score matched_keywords missing_keywords reasoning}] recommendations github_projects}`,
  `tailored{used score baseScore file path baseFile basePath pass uploaded resume{changes not_added github_added}}`,
  `steps[{fields[{label value source confidence reasoning}]}]`, `warnings`, `usage{costUsd …}`, `archived{at reason}`.
  Stage 3 adds `tailored.versions[{v by(claude|you) file path score at note changes resume confirmed}]` (oldest first, last = current; missing = v1 from tailored{})
  and `tailored.sent{v at company}` (missing on old applied records = v1 when `uploaded`). A re-upload moves `tailored.file/path/score` to the new version; the sent one never changes.
- `applications.csv`: tab-separated activity log `date site status id title company url reason`.
- `data/settings.json`: `applyMode dailyJobs dailyApplyLimit scheduleEnabled scheduleTime modelDaily modelWeekly minAtsScore tailorTarget postedWithin tailorMaxPasses maxRunMinutes claudePath …` (defaults in `config.mjs`).
- `data/profile.json`: `name goalsText preferences locations workplace seniority targets[{field searchTerms why}] titleExclude companyExclude facts githubUser onboardedAt`,
  `answers{salary military license notice travel relocation english: {tr en}}` (moved out of `facts` once by `config.mjs` `loadProfile()`; old text in `factsBeforeAnswers`).
  `config.profile` (what every prompt reads) = standard answers + remaining facts.
- `data/resumes.json`: per original in `resumes/`: `name language fields defaultFor uploadedAt read{resume roles skills languages new_skills} history[{v at path note}]`.
  Old files of originals are in `data/resumes_history/<file>/v<N>-<file>`; same-name uploads archive first. Staged uploads wait in `data/staging/<token>/`.
- `data/runs/current.json` (live run: `phase detail counts events anomalies pid`), `data/runs/<id>.json` (finished: `outcome{summary stop} selection`), `*.log` task logs.
- `data/market/review.json` (`review{headline verdict_points segments strengths gaps todo resume_fixes stop_doing}`, `stats`), `todo_state.json` (`title → doneAt`), `keyword_audit.json`.
- `data/conversations/<site>-<id>.json`: Ask Claude chats per job (`site id title company messages[{role text at}] costUsd updatedAt`).
- `data/github/repos.json` (`user fetchedAt repos`), `data/github/review.json` (`repo → review`); `data/library/<field>/` ready resumes (`meta.json` + `versions[]`, older PDFs in `versions/`, your uploads in `v<N>/`);
  `data/tailored/<job>/` tailored PDFs (`pass1`, `pass2`, re-uploads in `v<N>/`);
  `data/doctor/<id>.json` reports + `backups/`; `resumes/` uploads; `browser_profile/` LinkedIn sign-in.
- Status words, tones and Jobs filter buckets live in `ui/js/components/status-pill.js` (`STATUS`); never show raw names like `resume_insufficient`.
  The primary action per status is `PRIMARY` in `screens/jobs/detail.js`.

## UI rules
- Tokens only: every color, font, space, radius and shadow is a `var(--…)` from `tokens.css`. No hard-coded colors (no hex, rgb, or named colors) in CSS or JS.
- Use the design system's `jp-` classes (`components.css`) and the canvas helpers in `app.css`; new shared pieces go in `js/components/`.
- Status always pairs color with a word (`statusPill`, `jp-callout` with text). Never color alone.
- One primary action (`jp-btn--primary`) per region; others are default, tinted or plain.
- Theme: Mocha (`.jp-mocha`) by default, Latte (`.jp-latte`) on `<html>`; follows the system until the user flips the switch in More.
- No emoji in new UI; icons are the 1.5px line set in `util.js` `icon()`. Sentence case. Text from the user's side.
- Keep each file under ~300 lines. Screens render into `#view`; re-render through `app.render()`; all server calls via `api.js`.
- Old screens still use `legacy.css` / `legacy.js` (scoped under `.legacy` on `#view`). When a stage rebuilds a screen, move it to jp- markup
  and delete the legacy CSS/helpers nothing uses any more. After editing tokens.json, run `node design/gen-tokens.mjs`.
- After adding new files under `ui/`, nothing else is needed: the server serves them and the doctor backs up all of `ui/`.

## Screens → files → canvas boards
Canvas: https://claude.ai/artifact/QN4L8Dp21549eHZrEzfudZ (boards are `project/<Board>.dc.html`; read only the ones the task needs).
Design system: https://claude.ai/code/artifact/bd77b878-3e00-4d29-b225-02ce02531311 (`project/README.md`, `tokens.json`, `components/bundle.css`).

| Screen | File(s) | Canvas board(s) |
|---|---|---|
| Shell: top bar, run status, Ask Claude, More | `index.html`, `js/shell.js`, `components/sheet.js` | Main (top bar), A-Ask, B-Guidance (Ask Claude slide-over) |
| Jobs (list + detail) | `screens/jobs/`: `index.js` (screen, actions, keys) `model.js` (data → words) `list.js` `detail.js` `detail-cards.js` `posting.js` `ask.js`; `styles/jobs.css` | Main, A-Latte, A-Posting, A-Group, JobDetail |
| Job statuses and problem states | `screens/jobs/detail.js` (notes, `PRIMARY`), `screens/jobs/list.js` (run numbers), `components/status-pill.js` | Jobs-Applied, Jobs-Approve, Jobs-LoggedOut, Jobs-RunFailed, Jobs-Limited, Jobs-FirstDay |
| Guidance | `screens/guidance.js` (placeholder) | Guidance, Guidance-Interview |
| Resumes | `screens/resumes/`: `index.js` (screen, actions, keys) `model.js` (data → rows, words) `list.js` `detail.js` `history.js` (changes, versions, jobs, defaults) `answers.js` `upload.js` `reupload.js`; `styles/resumes.css` | Resumes, Resumes-Original, Resumes-Answers, Resumes-Reupload, Resumes-Upload, Resumes-Latte |
| Insights (now: Overview + GitHub review) | `screens/insights.js`, `screens/overview.js`, `screens/github.js` | Insights, Insights-Todo, Insights-Gaps, Insights-Market, Insights-GitHub, Insights-Latte, Insights-Latte-Todo |
| Settings | `screens/settings.js` | Settings, Settings-Applying, -Review, -Never, -Latte, -Schedule, -Notifications, -Privacy, -Usage |
| Onboarding | `screens/onboarding.js` | Onboarding, Onboarding-Profile |
| Activity | `screens/activity.js` | Activity, Activity-Stopped |
| Doctor | `screens/doctor.js` | Doctor |

B-Board, C-Grid and C-Sheet are alternative layouts (sidebar, dock): reference only, not the chosen shell.

## Stage plan
0. **Foundation** (done): `ui/` structure, tokens, components, shell from Main; old screens mounted unchanged.
1. **Jobs** (done): rebuild list + detail in jp- markup (Main, A-*, JobDetail): grouping menu, filters, score rings, posting and Ask panels.
2. **Job statuses**: the new statuses (waiting for your OK, viewed, interview, rejected, no reply) and the problem states (Jobs-* boards). Needs server/record support.
3. **Resumes** (done): originals, ready and tailored with versions, standard answers, upload, Export to edit (.docx) and re-upload checks.
4. **Insights**: tabs Pipeline, To-do, Skill gaps, Job market, GitHub (replaces overview.js / github.js).
5. **Guidance**: coach chat and mock interview; wire Ask Claude for real.
6. **Settings + Onboarding**: search profiles, applying, never-apply list, schedule, notifications, privacy, usage; onboarding steps.
7. **Activity + Doctor**: run history with stopped runs, doctor checks.

Each stage: read only its boards, keep behavior working, delete the legacy code it replaces, check both themes, commit "Stage N: …".
