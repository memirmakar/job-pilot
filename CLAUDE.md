# Job Pilot

Local Windows app: searches LinkedIn daily (Playwright + Edge), has the user's Claude Code CLI pick, score and tailor resumes, applies via Easy Apply
where allowed, and explains every decision in a local web UI (`node server.mjs`, plain ES modules in `ui/`, no build). README.md is the user's view.

## Start every task
1. Read `docs/STATUS.md` (handover: state, known issues, active plans). If the prompt names a plan (`docs/plans/<plan>.md`), read it and follow `docs/plans/README.md`.
2. Find the code in `docs/CODEMAP.md` (every file's purpose, exports and routes with line numbers). Open only what the task needs.
3. Read a topic doc only when the task touches it: `docs/DATA.md` (data files), `docs/DECISIONS.md` (rules the app follows; check before changing behavior).
   UI rules, tokens and screens are in `ui/CLAUDE.md`, which loads by itself when you work under `ui/`.
4. A feature that needs more than one chat gets a plan file in `docs/plans/` (template in its README) before work starts.

## Keep context small
- Never `cat` whole files or several files at once. Locate with Grep (or `grep -n`), then Read with `offset`/`limit` around the lines you need. Don't re-read what is already in context.
- Never read `browser_profile/`, `node_modules/`, `design/tokens.json`, `ui/styles/tokens.css` or `components.css` (token and class names are in ui/CLAUDE.md).
- Data: print keys or one record with a `node -e` one-liner; never dump `data/` files or folders. Logs (`run.log`, `applications.csv`, `data/runs/*.log`): tail only.
- Cap command output (`| head`, `| tail -n 40`). Run checks that print a summary, not everything.
- UI checks: page text, `read_page` or a small JS check first; at most 3 screenshots per task, scale 0.5, at the end.
- Don't read the design canvas unless the task is new UI design; then one board at a time (see ui/CLAUDE.md).
- One task per chat. If it grows past two areas, finish the first, update STATUS, and say what the next chat should do.

## Safety
- Never start a real run or submit an application while working: "Run now", "Run again" and "Send now" submit for real. Stub `/api/run` and `/api/send` in the browser,
  or use `node apply.mjs run --dry-run --limit 2` (`--mode ask_all` to test holding, `--no-tracker` to leave applied records alone, `--job <id>` to send one approved job in dry-run mode).
  Any test that processes job records uses at most 5.
- Onboarding and Delete my data are tested only on a copy of the app with an empty `data/` (code + `ui/` + a `node_modules` junction) started with `JP_TEST_COPY=1`
  (it never touches Windows' scheduled task or builds the library). Never on the real `data/`.
- `node apply.mjs tracker` reads LinkedIn's job tracker read-only and saves nothing. `node apply.mjs selftest` checks LinkedIn can be read.

## Run and check
- App: `node server.mjs` (http://127.0.0.1:4510). Test copy: `PORT=<free port> node server.mjs --no-open`; check the port is free first.
- `node --check <file>` on every edited `.mjs`/`.js`. Click through the screens you touched in Mocha and Latte with the console open.
- No new npm packages, frameworks or build steps without asking: users install with `Install.cmd` only. Keep files under ~300 lines; add modules instead of growing big ones.

## Finish every task
1. `node tools/codemap.mjs` if you added, removed or renamed files or exports.
2. Update `docs/STATUS.md` (replace stale lines; known issues and next steps), add one line to `CHANGELOG.md`, and update `docs/DATA.md`, `ui/CLAUDE.md`
   or `docs/DECISIONS.md` if you changed what they describe. Working on a plan: update its stages, Handover and Next prompt (docs/plans/README.md).
3. Commit with a message saying what changed for the user.
