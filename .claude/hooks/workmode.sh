#!/usr/bin/env bash
# Work mode (decisions 540, 541): one line in every turn while .claude/workmode exists and is less than 12 hours
# old. Older, it has run out and the hook says nothing, as if it were off. Never blocks a turn.
d="${CLAUDE_PROJECT_DIR:-.}"
f="${d//\\//}/.claude/workmode"
[ -f "$f" ] || exit 0
[ -n "$(find "$f" -mmin -720 2>/dev/null)" ] || exit 0
echo "Work mode: on since $(cat "$f"), for 12 hours (the rules: .claude/skills/workmode/SKILL.md, What changes while it's on; the switch: CLAUDE.md, Work mode). For the four area forks only: questions for the owner go to the main session; blocked, say so and carry on with the rest of your current task. A side session, or the main session, works as usual."
exit 0
