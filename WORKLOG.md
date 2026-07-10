# Polygram — Work Log

> Session-by-session diary. What Harry worked on, when, results.

## 2026-07-10

### 15:00–17:00 — tg-router agent + full pipeline build

**Accomplished:**
- tg-router agent created (~/.claude/agents/tg-router.md): subagent-first, Karpathy 4 rules, verification loop, auto-skill pipeline, research integration, monitor subagents, session briefing with dreaming phase
- Crash recovery fixes: timeout 300→1200s, SIGTERM grace 2s→5s, streamer empty-text guards, forum_topic_edited fatal fix
- No-edit streaming: each thinking step = new message bubble, never overwrites
- Dynamic command menu: scans ~/.claude/skills/ (216 skills) + ~/.claude/plugins/cache/, registers via setMyCommands
- Hot-reload: fs.watch on config.json + skills dir + lib/ (config/skills in-process, lib triggers graceful restart)
- Auto-join groups: bot.on('my_chat_member') handler, auto-registers with allowedSenders=["7580128132"]
- Queue feedback: temporary "⏳ Queued" reply when message waits behind another turn
- Edit correction: injects before/after context ("Was: X. Now: Y")
- Auto-resume: kills stuck process before retrying (was: retry into same hung process)
- Chinese abort phrases: 停下, 停止, 取消, 退出, 算了, 别做了
- Approval system: gated tools (sudo, rm -rf, config edits, browser automation) → admin DM cards
- Bidirectional CLI↔Polygram sync: session JSONL mtime detection → needsRespawn() → kill + --resume
- Hermes skill sync: 18 research/agent skills symlinked from ~/.hermes/skills/
- /btw command: side question with minimal context, BTW prefix injected
- Research pipeline: AnySearch MCP + subagent double-check with cross-verify + double-check
- 5-level memory storage: Neural Memory, Mem0 (Ollama-dependent), PROJECT.md, WORKLOG.md, CLAUDE.md
- CLAUDE.md + PROJECT.md + WORKLOG.md for polygram project itself

**Subagents deployed:** ~7 (writing, fixing, researching across multiple worktrees)

**Key decisions:**
- tg-router as custom agent (not system prompt) → more reliable, CC-native pattern
- No-edit streaming → preserves every thinking step as independent message
- bypassPermissions for subagents → otherwise hang waiting for approval
- 1200s default timeout → NOVA group tasks need >10min
- Research pipeline BEFORE coding → prevents wrong-direction work

**Next:** Test Mem0 with Ollama running, verify briefing auto-generation in live TG chat
