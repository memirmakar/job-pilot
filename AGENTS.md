# Job Pilot

The working rules for every coding agent are in `CLAUDE.md`. Read it first, then follow its "Start every task" steps
(`docs/STATUS.md`, then `docs/CODEMAP.md`). Keep one copy of the rules: edit `CLAUDE.md` and the docs, not this file.

Never skip these, even for a small task:
- Never start a real run or submit an application. Use `node apply.mjs run --dry-run --limit 2`, or stub `/api/run` and `/api/send` in the browser.
- Never read `browser_profile/` or `node_modules/`, and never dump `data/`. Read files at the lines `docs/CODEMAP.md` gives, not whole files.
