# Job Pilot

Local Windows app that searches LinkedIn daily (Playwright + Edge), has the user's Claude Code CLI pick, score and tailor
resumes for each job, applies via Easy Apply where allowed, and explains every decision in a local web UI. See README.md for the user's view.

**Rule for every session: read this file first, open only the files and canvas boards the task needs, and commit at the end.**

## Run and test
- App: `node server.mjs` (opens http://127.0.0.1:4510). `PORT=4519 node server.mjs --no-open` runs a second copy for testing.
- Onboarding and Delete my data are tested on a copy of the app with an empty `data/` (code files + `ui/` + a `node_modules` junction) started with
  `JP_TEST_COPY=1`: it never touches Windows' scheduled task and starts no library build. Never on the real `data/`.
- Install for users is `Install.cmd` only: no build step, no bundler, no framework. The UI is plain files served from `ui/`.
- Checks: `node --check <file>` on every edited `.mjs`/`.js`; `node apply.mjs selftest` checks LinkedIn can be read.
- Never start a real run while working on the UI ("Run now", "Run again" and "Send now" submit real applications). Stub `/api/run` and `/api/send`
  in the browser, or use `node apply.mjs run --dry-run --limit 2` (`--mode ask_all` to test holding, `--no-tracker` to leave applied records alone,
  `--job <id>` to send one approved job in dry-run mode). Any test that filters or processes job applications uses at most 5.
- `node apply.mjs tracker` reads LinkedIn's job tracker read-only and prints what the run would add; it saves nothing.
- Click through every screen touched (and the shell) in Mocha and Latte, at desktop and phone width, with the console open.

## Folder map
| Path | What |
|---|---|
| `server.mjs` | HTTP server: `/api/*` routes, `/pdf`, and static files from `ui/` |
| `apply.mjs` | CLI entry (`run`, `login`, `library`, `review`, `github`, `tracker`, `todo`, `rescore`, `selftest`, `doctor`) |
| `pipeline.mjs` `tailor.mjs` `run_notices.mjs` | daily run; tailoring passes for one job; the end-of-run Windows toasts (`settings.notify`) |
| `profiles.mjs` | search profiles: `profile.targets` + overrides resolved against the global profile/settings (`activeProfiles`, `profileFor`, `filesFor`, `workplaceParam`, per-profile applied today, jobs this week) |
| `linkedin.mjs` `linkedin_form.mjs` | LinkedIn search, job pages and availability; the Easy Apply form helpers (re-exported by `linkedin.mjs`) |
| `llm.mjs` `llm_daily.mjs` `llm_reviews.mjs` | Claude calls: `ask()`, scoring, tailoring, library; answering + picking; GitHub/market reviews, keyword audit, onboarding plan (all re-exported by `llm.mjs`) |
| `easy_apply.mjs` | the Easy Apply form: submit, hold for your OK (`waiting_ok`), dry run, and sending approved jobs (`sendQueue`) |
| `approval.mjs` `statuses.mjs` `status_routes.mjs` | Waiting for your OK (hold rule, approve/skip, approved answers); status history after Applied; `/api/status` `/api/approve` `/api/skip` `/api/send` |
| `applied_sync.mjs` `linkedin_guard.mjs` | LinkedIn job tracker reader (once per run, read only); signed-out/limit checks after each navigation (`LinkedInLoginError`, `LinkedInLimitError`) |
| `store.mjs` `config.mjs` | records, CSV log and run status; settings/profile loading |
| `conversations.mjs` | Ask Claude about a job (the Jobs panel): builds the job context, calls `llm.mjs` `ask()`, saves `data/conversations/` |
| `coach.mjs` `coach_context.mjs` `coach_interview.mjs` `coach_store.mjs` `coach_routes.mjs` | Guidance: coach chat (system prompt with the honesty rule, actions in the JSON schema, running summary), the bounded context (≤20k chars: profile, the conversation's job, ≤8 ranked jobs, resumes, GitHub, market review, top to-do; parts switchable), weekly check-in (`weekFacts`, `checkinDue`), mock interview, conversation files; `/api/coach/*` (one call per conversation at a time; Cancel kills it through `ask({ signal })`) |
| `library.mjs` `market.mjs` `github.mjs` `doctor.mjs` `resume_pdf.mjs` | ready resumes, market review, GitHub review, self-repair, PDF rendering |
| `resumes.mjs` `reupload.mjs` `resume_read.mjs` `resume_routes.mjs` | Resumes screen: listing with versions, staged uploads and new versions, Claude reading/checking resume files, `/api/resumes/*` routes |
| `insights.mjs` `insights_routes.mjs` | Insights data the server works out (job fields, not-picked jobs, to-do items, job market numbers); `/api/insights` `/api/todo` `/api/todo/add` (`ids` to mark, or `items` = new steps from Guidance) |
| `todo.mjs` `todo_group.mjs` `rescore.mjs` `market_snapshot.mjs` | to-do items from the market review + every job's raise steps (done/added marks, re-score flags); Claude merging new steps (incremental, cached); the run's re-score of flagged jobs; one market snapshot per run |
| `settings_routes.mjs` `usage.mjs` `data_tools.mjs` | Settings + onboarding routes (settings/profile saving, the Windows scheduled task, onboarding plan/progress/finish, GitHub check, test toast, never-apply counts, `/api/usage`, `/api/export`, `/api/data/delete`); usage report; export ZIP and delete-with-backup (`backups/`) |
| `answers.mjs` `docx.mjs` | standard answers (keys, migration out of facts, prompt text); `.docx` export and reading back (Node zlib only) |
| `ui/index.html` | shell markup (top bar), loads the CSS and `js/main.js` |
| `ui/styles/` | `tokens.css` (generated), `components.css` (design-system bundle, copy), `app.css` (canvas helpers + shell), `jobs.css` (Jobs screen), `resumes.css` (Resumes screen), `insights.css` (Insights screen), `guidance.css`, `activity.css` (Activity + Doctor), `settings.css` (Settings), `onboarding.css` (Onboarding) |
| `ui/js/` | `main.js` boot · `api.js` every server call · `state.js` data + view state · `router.js` sections · `shell.js` top bar (+ `PHASE`, run phases in words) · `actions.js` all `data-action` handlers · `theme.js` · `util.js` (`rows()` = one entry per line; `lines()` also splits on commas) |
| `ui/js/components/` | `score-ring` `status-pill` `tag` `list-row` `card` (+ callout) `sheet` (slide-over, or `center: true` dialog) `company-logo` `drop` (drag-and-drop files) `coach-text` (Claude's text + `[[job:|resume:|repo:|todo:id|label]]` links, used by Guidance and the Ask panel) |
| `ui/js/screens/` | one file per screen, or a folder for big ones (`jobs/`, `resumes/`, `insights/`); table below |
| `design/` | `tokens.json` (from the design system) and `gen-tokens.mjs` → `ui/styles/tokens.css` |

## Data files (all git-ignored)
- `data/applications/<site>-<id>.json`, one per job: `title company location url status statusReason createdAt submittedAt description field easyApply externalUrl postedAt postedText applicants logoUrl selection{reason}`,
  `ats{best_score best_file summary resumes[{file ats_score matched_keywords missing_keywords reasoning}] recommendations github_projects}`,
  `tailored{used score baseScore file path baseFile basePath pass uploaded resume{changes not_added github_added}}`,
  `steps[{fields[{label value source confidence reasoning}]}]` (source: prefilled | claude | approved), `warnings`, `usage{costUsd …}`, `archived{at reason}`.
  Stage 2 adds `statusHistory[{status at source note date}]` (status: viewed | interview | offer | rejected | applied (back to applied) | listing_closed;
  source: linkedin | you; `date` = interview "YYYY-MM-DDTHH:MM"). `status` stays `applied`; the app shows the latest entry, and "No reply" is computed
  (no news for `noReplyDays` since the last entry or submittedAt), never stored. Held jobs: `status: waiting_ok` with `statusReason`; approving sets
  `status: approved` + `approval{at answers[{label value}] skipped lastDryRun}`; sending moves the held `steps` to `heldSteps` and refills `steps`.
  Stage 3 adds `tailored.versions[{v by(claude|you) file path score at note changes resume confirmed}]` (oldest first, last = current; missing = v1 from tailored{})
  and `tailored.sent{v at company}` (missing on old applied records = v1 when `uploaded`). A re-upload moves `tailored.file/path/score` to the new version; the sent one never changes.
  Stage 4 adds `rescore{at items[]}` ("Re-score on next run": set by ticking a to-do item that lifts the job, never on applied or archived jobs; cleared by
  `rescore.mjs`, up to `rescorePerRun` (max 5) per run) and `rescored{at from to items}`. A re-score that lifts a `resume_insufficient` job to the cutoff makes it `ready_to_apply`.
- `applications.csv`: tab-separated activity log `date site status id title company url reason`.
- `data/settings.json`: `applyMode` (auto | ask_below_target | ask_all | analyze_only; unknown = analyze_only) `noReplyDays` `dailyJobs dailyApplyLimit scheduleEnabled scheduleTime modelDaily modelWeekly minAtsScore tailorTarget postedWithin tailorMaxPasses maxRunMinutes rescorePerRun claudePath …` (defaults in `config.mjs`).
  Stage 6 adds `weeklyJobs` (0 = off; with `dailyJobs`, the "Pause runs after about N jobs a day / M a week" caps, counted across runs), `scheduleDays` ["Mon"…"Sun"]
  (all = a daily trigger, else weekly on those days), `notify{run needsYou replies errors}` (Windows toasts, all on by default), `uploadTailored` (now switchable).
- `data/profile.json`: `name goalsText preferences locations workplace seniority targets[{field searchTerms why on locations workplace resume tailorTarget minAtsScore dailyApplyLimit titleExclude}] titleExclude companyExclude facts githubUser onboardedAt`,
  (a target is a search profile; `on: false` = not searched; every other key is an optional override, missing = the global value; `resume` = Resumes id `o:<file>` or `r:<field slug>`;
  a profile's `titleExclude` adds to the global one; `workplace` other than all three adds LinkedIn's `f_WT` filter),
  `answers{salary military license notice travel relocation english: {tr en}}` (moved out of `facts` once by `config.mjs` `loadProfile()`; old text in `factsBeforeAnswers`).
  `config.profile` (what every prompt reads) = standard answers + remaining facts.
- `data/resumes.json`: per original in `resumes/`: `name language fields defaultFor uploadedAt read{resume roles skills languages new_skills} history[{v at path note}]`.
  Old files of originals are in `data/resumes_history/<file>/v<N>-<file>`; same-name uploads archive first. Staged uploads wait in `data/staging/<token>/`.
- `data/runs/current.json` (live run: `phase detail counts events anomalies pid`), `data/runs/<id>.json` (finished: `outcome{summary stop stopKind stoppedAt resumeAt} selection usage{analyze|tailor|answers|select: {calls costUsd}}`), `*.log` task logs.
  `costUsd` is Claude Code's API-price estimate, shown as an estimate, never a bill. Filtered log rows say which never-apply entry matched (`excluded company "X"` / `excluded title word "X"`).
- `data/onboarding.json`: onboarding progress (step, reached, answers, the plan) so setup resumes where it stopped. `backups/`: the ZIP written before Delete my data.
  `stopKind`: linkedin_login | linkedin_limit | claude_limit | claude_login | time_limit | browser_closed | repeated_errors | crash | stopped (old runs: none).
  The Jobs problem states read it (`screens/jobs/track.js` `runProblem()`); a `current.json` left unfinished counts as a stopped run.
- `data/market/review.json` (`review{headline verdict_points segments strengths gaps todo resume_fixes stop_doing}`, `stats`), `keyword_audit.json`.
  `todo_state.json` = `{v: 2, done{itemId: at}, added{itemId: at}, legacy{}}` (v1 was `title → doneAt`; `todo.mjs` moves titles to item ids, unknown ones stay in `legacy`).
  `todo_groups.json` = `{at, groups[{id title keys[]}]}`: Claude's merges. Source keys: `m:<title hash>` (market todo) and `r:<site>-<id>:<action hash>` (a job's
  step, the same list the Jobs raise card shows: tailored recommendations when the tailored resume is used). Item id = `t-<hash of its first step's text>`,
  so marks on an unmerged step keep their id; only steps no group has seen go to Claude. `snapshots.json` = one entry per run from Stage 4 on
  (`at run listings fields{} cities{} workplace{remote hybrid onsite unknown} easyApply companies{name: {n field}}`, last 200). Listing cards now carry `workplace`.
- `data/github/review.json` entries gain `relevance field fixes[] pin(pin|maybe|dont)`; a refresh re-reviews repos whose review lacks `relevance`.
- `data/conversations/`: one format for every conversation (`coach_store.mjs`): `<site>-<id>.json` per job (shared by the Jobs Ask panel and Guidance), `g-<id>.json` general, `weekly.json` the pinned check-ins;
  deleted ones move to `deleted/`. `{ v: 2, cid kind(job|general|weekly) title titleByYou site id company createdAt updatedAt messages[{ role(user|claude) text at kind? actions[]? stats? n? }]
  summary{text upto} context{goals resumes github jobs market off[]} interview{job lang plan[{q about}] i startedAt answers[]}|null interviews[] costUsd usage{calls input output promptChars} lastCall }`.
  Message kinds: checkin, iv-intro, iv-question, iv-answer, iv-feedback, iv-summary. Actions: add_todo (todo_id or title/why/hours, or items[]), update_goals (goals_text),
  resume_edit (resume_id t:|r:, find, replace: staged as .docx and checked by `reupload.mjs` `checkStaged`), draft_message (draft, recipient), mock_interview (job).
  Custom to-do steps from Guidance live in `todo_state.json` `custom{ "c:<hash>": { title why hours kind at } }`. The check-in timer in `coach_routes.mjs` is off with `JP_NO_AUTO_CHECKIN=1`.
- `data/github/repos.json` (`user fetchedAt repos`), `data/github/review.json` (`repo → review`); `data/library/<field>/` ready resumes (`meta.json` + `versions[]`, older PDFs in `versions/`, your uploads in `v<N>/`);
  `data/tailored/<job>/` tailored PDFs (`pass1`, `pass2`, re-uploads in `v<N>/`);
  `data/doctor/<id>.json` reports + `backups/`; `resumes/` uploads; `browser_profile/` LinkedIn sign-in.
- Status words, tones and Jobs filter buckets live in `ui/js/components/status-pill.js` (`STATUS`); never show raw names like `resume_insufficient`.
  Everything after Applied (viewed, interview, offer, rejected, no_reply) is in the Applied filter; waiting_ok and approved are in To apply.
  The status a job shows is `shown(r)` in `screens/jobs/track.js`. The primary action per status is `PRIMARY` in `screens/jobs/detail.js`.
- Sent jobs show the score of the version sent (`tailored.sent`), with "A newer version scores N"; downloads serve the newest version.

## UI rules
- Tokens only: every color, font, space, radius and shadow is a `var(--…)` from `tokens.css`. No hard-coded colors (no hex, rgb, or named colors) in CSS or JS.
- Use the design system's `jp-` classes (`components.css`) and the canvas helpers in `app.css`; new shared pieces go in `js/components/`.
- Status always pairs color with a word (`statusPill`, `jp-callout` with text). Never color alone.
- One primary action (`jp-btn--primary`) per region; others are default, tinted or plain.
- Theme: Mocha (`.jp-mocha`) by default, Latte (`.jp-latte`) on `<html>`; follows the system until the user flips the switch in More.
- No emoji in new UI; icons are the 1.5px line set in `util.js` `icon()`. Sentence case. Text from the user's side.
- Keep each file under ~300 lines. Screens render into `#view`; re-render through `app.render()`; all server calls via `api.js`.
- Every screen is jp- markup; there is no legacy CSS or JS any more. After editing tokens.json, run `node design/gen-tokens.mjs`.
- After adding new files under `ui/`, nothing else is needed: the server serves them and the doctor backs up all of `ui/`.

## Screens → files → canvas boards
Canvas: https://claude.ai/artifact/QN4L8Dp21549eHZrEzfudZ (boards are `project/<Board>.dc.html`; read only the ones the task needs).
Design system: https://claude.ai/code/artifact/bd77b878-3e00-4d29-b225-02ce02531311 (`project/README.md`, `tokens.json`, `components/bundle.css`).

| Screen | File(s) | Canvas board(s) |
|---|---|---|
| Shell: top bar, run status, Ask Claude, More | `index.html`, `js/shell.js`, `components/sheet.js` | Main (top bar), A-Ask (Ask Claude opens a new Guidance conversation) |
| Jobs (list + detail) | `screens/jobs/`: `index.js` (screen, actions, keys) `model.js` (data → words) `list.js` `detail.js` `detail-cards.js` `posting.js` `ask.js`; `styles/jobs.css` | Main, A-Latte, A-Posting, A-Group, JobDetail |
| Job statuses and problem states | `screens/jobs/track.js` (shown status, timeline, `runProblem`), `problems.js` (callouts, first day), `review.js` (review sheet, marks), `detail.js` (notes, `PRIMARY`), `components/status-pill.js` | Jobs-Applied, Jobs-Approve, Jobs-LoggedOut, Jobs-RunFailed, Jobs-Limited, Jobs-FirstDay, Settings-Review (sheet) |
| Guidance | `screens/guidance/`: `index.js` (screen, actions, composer) `model.js` (data → words) `list.js` `chat.js` (messages, check-in card, action buttons, thinking) `context.js` (what Claude knows) `interview.js` (interview + plan) `act.js` (Claude calls with Cancel, confirm sheets for actions, rename/delete); `styles/guidance.css` | Guidance, Guidance-Interview |
| Resumes | `screens/resumes/`: `index.js` (screen, actions, keys) `model.js` (data → rows, words) `list.js` `detail.js` `history.js` (changes, versions, jobs, defaults) `answers.js` `upload.js` `reupload.js`; `styles/resumes.css` | Resumes, Resumes-Original, Resumes-Answers, Resumes-Reupload, Resumes-Upload, Resumes-Latte |
| Insights | `screens/insights/`: `index.js` (header, tabs, actions) `model.js` (data → words; `todoFor()` feeds the Jobs raise card) `pipeline.js` `todo.js` `gaps.js` `market.js` `github.js`; `styles/insights.css` | Insights, Insights-Todo, Insights-Gaps, Insights-Market, Insights-GitHub, Insights-Latte, Insights-Latte-Todo |
| Settings | `screens/settings/`: `index.js` (sections, saving: `data-set` / `data-pset` fields save on change) `profiles.js` (search profile cards, defaults) `profile-sheets.js` (edit, delete, Ask Claude to suggest) `applying.js` (modes, limit, the Jobs review sheet as example) `never.js` `schedule.js` `notifications.js` `privacy.js` (accounts, export, delete) `usage.js` `usage-controls.js` (caps, models, CLI); `styles/settings.css` | Settings, Settings-Applying, -Review, -Never, -Latte, -Schedule, -Notifications, -Privacy, -Usage |
| Onboarding | `screens/onboarding/`: `index.js` (steps, saved progress, finish) `steps.js` (Claude, resumes via Resumes' upload sheet, GitHub, goals, plan, LinkedIn, schedule); `styles/onboarding.css` | Onboarding, Onboarding-Profile |
| Activity | `screens/activity/`: `index.js` (screen, actions, loads `/api/activity`) `model.js` (runs → words, skip reasons) `view.js`; `styles/activity.css`; server `activity.mjs` (runs + `applications.csv` rows + records; log rows before run files are "From the log" runs) via `activity_routes.mjs` | Activity, Activity-Stopped |
| Doctor | `screens/doctor/`: `index.js` (screen, actions) `checks.js` (health checks → words) `history.js` (Ask the doctor, fix history, Undo); `styles/activity.css`; server `doctor_checks.mjs` (read-only checks; LinkedIn = one feed visit, saved to `data/doctor/linkedin_check.json`), `doctor.mjs` `undoReport()` (puts back only a report's `changedFiles`, sets `undoneAt`) | Doctor |

B-Board, C-Grid and C-Sheet are alternative layouts (sidebar, dock): reference only, not the chosen shell.

## Stage plan
0. **Foundation** (done): `ui/` structure, tokens, components, shell from Main; old screens mounted unchanged.
1. **Jobs** (done): rebuild list + detail in jp- markup (Main, A-*, JobDetail): grouping menu, filters, score rings, posting and Ask panels.
2. **Job statuses** (done): statuses after Applied (LinkedIn job tracker + marks by hand + no-reply rule), timeline, Waiting for your OK (apply modes, review sheet, approved queue, Send now), problem states, sent score.
3. **Resumes** (done): originals, ready and tailored with versions, standard answers, upload, Export to edit (.docx) and re-upload checks.
4. **Insights** (done): tabs Pipeline, To-do (merged steps, done → re-score next run, "Add to my to-do list" on the Jobs raise card), Skill gaps, Job market (snapshots per run), GitHub.
5. **Guidance** (done): conversations (job ones shared with the Ask panel, Open in Guidance), coach chat with links and confirmed actions, context switches, weekly check-in, mock interview.
6. **Settings + Onboarding** (done): search profiles with overrides read by the run, applying, never-apply list with skip counts, schedule (days), Windows toasts,
   data and privacy (export, delete with backup), Claude usage (estimates, jobs a day/week caps, models); onboarding as a 7-step dialog; legacy code removed.

All stages are done.
7. **Activity + Doctor** (done): run history with stopped runs and per-job reasons, doctor health checks, fix history with Undo, Ask the doctor.

Each stage: read only its boards, keep behavior working, delete the legacy code it replaces, check both themes, commit "Stage N: …".
