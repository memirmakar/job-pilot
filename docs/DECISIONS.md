# Decisions

Rules the app follows and why. Change one only when the user asks; then update the rule here (date it) instead of adding an exception in code.

## What the app may do on the user's behalf
1. **Claude never invents experience.** Resumes, answers and coaching use only the user's originals, profile facts, standard answers, confirmed lines and approved GitHub
   projects. A line Claude can't support is flagged and needs the user's confirmation. *Why: the user sends these to real employers.*
2. **Nothing is submitted outside the apply mode.** `applyMode` decides (auto | ask_below_target | ask_all | analyze_only); unknown = analyze_only. Held jobs wait for the user's OK.
   Tests use `--dry-run`. *Why: an application can't be taken back, and LinkedIn restricts accounts that apply too much.*
3. **Daily numbers stay modest.** Caps are jobs a day/week, not dollars. *Why: LinkedIn's terms don't allow automated applying.*
4. **LinkedIn is read, never clicked, outside Easy Apply.** The job tracker and checks are read-only, one visit per check.
5. **Claude drafts, the user sends.** Messages to recruiters are copyable drafts, never sent. Actions that change data (goals, resumes, to-do) ask first.
6. **Coaching is honest.** For "why was I rejected?" and anything the data can't show, start from facts and say what can't be known; never invent an employer's reason.

## What never changes or disappears
7. **Sent versions are immutable.** A re-upload or edit creates a new version; the sent file stays byte-for-byte, and the job shows the score that was sent.
8. **Nothing is deleted.** Closed listings are archived; replaced resumes move to `data/resumes_history/`; Delete my data writes a backup first; the doctor backs up before fixing and can undo.
9. **Old data stays readable.** Add optional fields; never rename or require migration of existing records.
10. **"No reply" is computed, never stored** (from `noReplyDays`), so changing the setting re-labels history correctly.

## Money and models
11. **The user runs on a Claude Code subscription.** `costUsd` is shown as an estimate, never a bill. When the plan limit is hit, the run stops cleanly and continues next time.
12. **Balanced models:** `modelDaily` (Sonnet) for per-job work and chat; `modelWeekly` (Opus) for weekly reviews; ask before using the weekly model in chat.
13. **Claude calls are standalone** (`llm.mjs` `ask()` = one `claude -p` call, no memory), so every caller sends a bounded context (coach: ≤20k chars, ≤8 ranked jobs, rolling summary).

## Engineering
14. **No build, no framework, no new npm packages without asking.** Users install with `Install.cmd` only. Node built-ins only (zip and docx use zlib).
15. **Small modules.** Files stay under ~300 lines; new behavior goes in a new module, not in `pipeline.mjs`, `llm.mjs` or `linkedin.mjs`.
16. **The UI follows the Job Pilot design system** (Catppuccin Mocha/Latte, Mauve the only accent, Apple-like restraint). Rules in `docs/UI.md`.
17. **The LinkedIn browser is Edge** with its own persistent profile (`browser_profile/`); Playwright's bundled Chromium is only a fallback and isn't installed.
