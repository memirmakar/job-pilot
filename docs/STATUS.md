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
- Resume rules work is done (see CHANGELOG 2026-10-22). On the real data the user still has to: approve GitHub projects (Resumes > GitHub projects; all 8 are
  "Not reviewed", so no repo reaches a resume until then), add the photo (Resumes > Your resume rules; "Take it from an original" finds it in every PDF original),
  then "Rename files to the new pattern" (11 unsent files) and "Re-tailor unsent resumes" (7, about 28 Claude calls) when they choose.
- The .docx export has no photo yet (`docx.mjs` writes text only).

## Open decisions (ask the user)
- Photo on English resumes: the rule is unset on the real data ("Ask me"), so English resumes ask once.
