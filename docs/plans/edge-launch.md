# Clear errors when the browser can't start
Status: Active      Started: 2026-10-23

## Goal
When Edge can't start, runs (including test runs) fail with "Executable doesn't exist at …ms-playwright\chromium-…\chrome.exe", which tells the user nothing.
Done means: every browser start failure says what happened in plain words and what to do (e.g. "Job Pilot's Edge window is still open. Close it, then run again."),
in the run's stop reason, on the Jobs screen, in Activity and in Doctor. No real run is started while testing.

## What the code does today
- `linkedin.mjs` `launch()` (line ~35): starts Edge with the persistent profile (`config.browserChannel` = msedge). If that throws, it retries with Playwright's
  bundled Chromium, which isn't installed, so the user only ever sees the Chromium error and Edge's real error is lost.
- `resume_pdf.mjs` (line ~53): renders PDFs with Edge headless, no fallback.
- `pipeline.mjs` (line ~217) maps a closed window to `stopKind: browser_closed`; other launch errors end up as `crash`. Stop kinds are listed in docs/DATA.md.
- Jobs problem states read `stopKind` in `ui/js/screens/jobs/track.js` `runProblem()`; Doctor's checks are in `doctor_checks.mjs` (none for the browser yet).

## Decisions
- Edge is the browser (docs/DECISIONS.md 17). Don't download Playwright's Chromium automatically; installing it would need the user's OK.
- Open: should the app offer "Close Job Pilot's Edge windows for me"? Default: no, just say so, since closing a window could lose something the user is doing.

## Stages
- [ ] 1. **Next** Find the real errors: with a test script (not a run), start the persistent context in three situations: normal, while Job Pilot's Edge
  window is already open (profile in use), and with a wrong channel (stands in for Edge missing). Record the exact messages here. Use the test copy rules in CLAUDE.md.
  Done means: the three messages are in the Handover with how to tell them apart.
- [ ] 2. Report Edge's error: in `launch()`, keep Edge's error; fall back only if the bundled Chromium actually exists. Classify into new stop kinds
  `browser_in_use` | `browser_missing` | `browser_failed` with plain messages; use the same for `resume_pdf.mjs`. Update docs/DATA.md stop kinds.
  Done means: a dry run in each situation stops with the right kind and message.
- [ ] 3. Show it: Jobs problem state callout (`runProblem()`), Activity reason words, and a Doctor "Browser" check with one action each
  ("Close Job Pilot's Edge window, then Run again", "Install Microsoft Edge"). Done means: each situation reads clearly on all three screens, Mocha and Latte.

## Handover
Nothing done yet. The user's test runs on 2026-10-20 failed with the Chromium message above; Edge was probably already open with Job Pilot's profile.

## Next prompt
    Continue docs/plans/edge-launch.md
