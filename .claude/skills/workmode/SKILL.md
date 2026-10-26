---
name: workmode
description: Turn work mode on or off for every session in this folder (/workmode on, /workmode off, /workmode for the status). In work mode the forks send every question for the owner to the main session and keep working while blocked. Only when the owner runs it.
disable-model-invocation: true
---

# Work mode

Run in the main session, only when the owner types it (decision 540). The switch is the file `.claude/workmode`
(git-ignored): present means on. Every session reads it: the UserPromptSubmit / SessionStart hook in
`.claude/settings.json` adds "Work mode: on" to each turn while the file exists, and CLAUDE.md's Work mode section
says what changes for a fork and for the main session. Off is the rules as written everywhere else.

## /workmode on

1. Write the file: `date "+%Y-%m-%d %H:%M" > .claude/workmode` (bash).
2. Message each running fork (`list_sessions` with `linked: true`; `SendMessage` to its `local_…` id):
   "Work mode on (CLAUDE.md, Work mode): your questions for the owner come to me, with your pick; when blocked,
   tell me the block and carry on with what you can; reversible choices in your own area are yours, recorded in
   your Done entry."
3. Report: on since when, which forks were told (and any that aren't running), and what's open in NEXT.md, since
   the owner is about to work from the main thread alone.

## /workmode off

1. Delete the file: `rm -f .claude/workmode`.
2. Message each running fork: "Work mode off: back to asking the owner in your own chat."
3. Report what the forks sent while it was on that the owner hasn't answered yet, and the choices they recorded as
   "picked in work mode" in NEXT.md's Done entries, so the owner can reverse any of them.

## /workmode

Status: on since the time in the file, or off; which forks are running.

Remote Control is the owner's own setting; the skill doesn't touch it. The owner turns it on for the main session
when they want the main thread on their phone.
