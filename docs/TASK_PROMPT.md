# Starting a new chat (for the user)

Short prompts cost less. CLAUDE.md loads by itself and tells Claude which docs to read, so a prompt only needs the task.
Don't paste canvas links or file lists unless the task is new design work.

Template:

    <What to change, in a few sentences, from your point of view.>
    Done means: <how you'll know it works>.

Example:

    The weekly check-in shows dates like 2026-10-04. Show them as "Oct 4" instead.
    Done means: the check-in in Guidance shows short dates, and nothing else changes.

Tips:
- One task per chat. If a task touches more than two screens or areas, split it into two chats.
- Start a new chat instead of continuing a very long one; the handover in docs/STATUS.md carries what matters.
- For a bigger feature, ask first: "Plan this and tell me the steps before changing anything."

Bigger features (more than one chat):

    Plan this as docs/plans/<name>.md using the template in docs/plans/README.md. Don't change code yet.

Then start each following chat with only:

    Continue docs/plans/<name>.md
