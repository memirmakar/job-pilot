# Status and handover

Read this at the start of every task. Update it at the end: keep it short, replace stale lines instead of appending, and move finished items to CHANGELOG.md.

## Where things stand (2026-10-22)
- The UI rebuild is complete (stages 0–7, see CHANGELOG.md): every screen is jp- markup built from the design canvas; no legacy code is left.
- `master` holds everything. Two worktrees under `.claude/worktrees/` (stage 7, stage 5) are fully merged; safe to remove.
- The user's real data is in `data/`, `resumes/` and `browser_profile/` (all git-ignored). Apply mode is `analyze_only`.

- Loading states are in (router `load()` shows the skeleton until the first load; Activity and Doctor load their own data with the same skeleton and error). Guidance, Resumes and Settings' lazy lists still show short in-place "Loading…" text.

## Active plans (multi-chat features; start a chat with "Continue docs/plans/<plan>.md")
- `docs/plans/edge-launch.md`: clear errors when the browser can't start. Next: stage 1, find the real errors.
- `docs/plans/remote-access.md`: use the app from the phone over Tailscale; the app stays on this PC. Next: stage 5, show "Do this at your PC" for PC-only actions on the phone. The user still has to set up Tailscale and turn on Settings > Phone access (README).

## Known issues
- **Daily run isn't installed in Windows**: settings say on at 16:00, but no scheduled task exists ("Not scheduled" in the top bar). The user fixes it from Settings → Schedule.
- **Test runs fail when Edge doesn't start** and the error hides why: being fixed in the plan `docs/plans/edge-launch.md`.
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
