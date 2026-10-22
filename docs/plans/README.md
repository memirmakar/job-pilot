# Plans

A plan is one file per feature that takes more than one chat. It holds the goal, the decisions, the stages and a handover,
so each new chat starts from this file instead of the history. Start a chat with: `Continue docs/plans/<plan>.md`.

## Rules for a chat working on a plan
1. Read the plan file (and docs/STATUS.md). Do only the stage marked **Next**; don't start the one after it.
2. At the end: tick the stage, rewrite the Handover section (what was done, what's half-done, what the next chat should know),
   set the next stage to **Next**, and write the exact next prompt. Keep the file short: replace old handover text, don't append.
3. When the last stage is done: set Status to Done, add a CHANGELOG line, remove the plan from "Active plans" in docs/STATUS.md,
   and move the file to `docs/plans/done/`.
4. Decisions the user makes go in the plan's Decisions section; lasting rules also go in docs/DECISIONS.md.

## Template

    # <Feature name>
    Status: Active | Done      Started: <date>

    ## Goal
    <What the user wants, in their words, and what "done" means for the whole feature.>

    ## Decisions
    - <decided: what and why>  /  - Open: <question for the user>

    ## Stages
    - [ ] 1. <name> **Next**: <what to do>. Files: <from docs/CODEMAP.md>. Done means: <check>.
    - [ ] 2. <name>: …

    ## Handover
    <Rewritten at the end of every chat: state of the work, anything half-done, traps found, test notes.>

    ## Next prompt
        Continue docs/plans/<this file>.md
