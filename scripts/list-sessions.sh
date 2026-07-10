#!/bin/bash
DB="${POLYGRAM_DB:-$HOME/polygram/main-bot.db}"
LIMIT="${1:-20}"

echo ""
printf "%-30s  %-36s  %s\n" "CHAT" "SESSION ID" "LAST ACTIVE"
printf "%-30s  %-36s  %s\n" "────────────────────────────" "──────────────────────────────────" "──────────"

sqlite3 "$DB" -separator "  " "
SELECT
  substr(COALESCE(chat_id, '?'), 1, 28) || CASE WHEN length(COALESCE(chat_id, '?')) > 28 THEN '…' ELSE '' END,
  claude_session_id,
  datetime(last_active_ts, 'unixepoch', 'localtime')
FROM sessions
ORDER BY last_active_ts DESC
LIMIT ${LIMIT};
"

echo ""
echo "Resume:  cd ~ && claude --resume <SESSION-ID>"
echo ""
