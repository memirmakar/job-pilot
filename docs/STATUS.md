# Status and handover

Read this at the start of every task. Update it at the end: keep it short, replace stale lines instead of appending, and move finished items to CHANGELOG.md.

## Where things stand (2026-10-22)
- The UI rebuild is complete (stages 0–7, see CHANGELOG.md): every screen is jp- markup built from the design canvas; no legacy code is left.
- `master` holds everything. Two worktrees under `.claude/worktrees/` (stage 7, stage 5) are fully merged; safe to remove.
- The user's real data is in `data/`, `resumes/` and `browser_profile/` (all git-ignored). Apply mode is `analyze_only`.

## Known issues
- **Daily run isn't installed in Windows**: settings say on at 16:00, but no scheduled task exists ("Not scheduled" in the top bar). The user fixes it from Settings → Schedule.
- **Test runs fail when Edge doesn't start**: `linkedin.mjs` `launch()` falls back to Playwright's Chromium, which isn't installed, and that error hides Edge's real one.
  Fix idea: report the Edge error first, and say "close Job Pilot's Edge windows" when the profile is locked.
- **Weekly check-in prints raw ISO dates** ("2026-10-04") instead of "Oct 4" (`coach.mjs` / `weekFacts`).
- `package.json` still has a `kariyer` script for a job site the app no longer supports.
- Data to check with the user: the sent Bulutistan resume says military service "deferred (2 years)" while the profile says exempt.

## Next up
- **Resume tailoring fixes** (in progress in another window, uncommitted on 2026-10-22: `resume_*.mjs`, `github_projects.mjs`, `retailor.mjs`, `screens/resumes/`):
  an "Ask Claude to change this resume" box and standing resume rules; GitHub projects list
  (use / never use / not reviewed, with professional resume names instead of repo names; gaming and hobby repos excluded); neutral PDF file names that don't reveal tailoring;
  the user's photo on Turkish resumes (`resume_pdf.mjs` has no photo field today); right-click Rename/Delete in the Resumes list; re-tailor unsent resumes on confirm.

## Open decisions (ask the user)
- Photo: extract from the original PDF or upload separately.
- Where the GitHub projects list lives: Resumes or Settings.
