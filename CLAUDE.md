# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Fork Overview

This is a fork of `polygram@shumkov` (v0.17.11) — a Telegram daemon that bridges Claude Code to Telegram chats. Per-chat persistent SDK Query sessions, streaming replies, multi-group support.

Key modifications from upstream (see `git log` for full history):
- **Crash recovery**: timeout 300→600s, SIGTERM grace 2s→5s, streamer empty-text guards
- **No-edit streaming**: `lib/telegram/streamer.js` — each chunk is a new message (archives old bubbles), no `editMessageText` at all
- **Dynamic command menu**: scans `~/.claude/skills/` + `~/.claude/plugins/cache/` for `SKILL.md` / `commands/*.md` files, registers via Telegram `setMyCommands`
- **Hot-reload**: `fs.watch` on config.json + skills dir + lib/ (config/skills reload in-process, lib changes trigger graceful restart)
- **Auto-join groups**: `bot.on('my_chat_member')` handler auto-registers new groups with `allowedSenders`
- **Queue feedback**: sends temporary "⏳ Queued" reply when message waits behind another turn
- **Edit correction**: injects before/after context (`"Was: X. Now: Y"`)
- **Auto-resume**: kills stuck process before retrying (was: retry into same hung process)
- **Chinese abort phrases**: `停下, 停止, 取消, 退出, 算了, 别做了`
- **tg-router agent**: Custom agent with subagent-first routing, Karpathy 4 principles, verification loop, auto-skill pipeline
- **Research integration**: `research` + `cross-verify-search` + `double-check` + `onezion-research-pipeline` auto-fire before decisions
- **Multi-round verification**: Subagent internal loop (define→attempt→verify→gap→bridge) + main agent gate review (Iron Law)
- **Long-running monitors**: Background subagents for deployed features with periodic health checks and self-healing
- **Approval system**: Gated tools (sudo, rm -rf, config edits, browser automation) → admin DM approval cards
- **Auto-resume-after-reload**: Config/skills changes → kill warm → send resume prompt to all chats
- **Hermes skill sync**: 18 research/agent skills symlinked from ~/.hermes/skills/ to ~/.claude/skills/
- **No-edit streaming**: Each thinking step is a NEW message bubble, never overwrites previous ones

## Architecture

```
Telegram (grammy long-poll) → polygram.js (main)
  ├─ gate-inbound.js        — one intake gate: abort → admin → rewind → shouldHandle → dispatch
  ├─ handleMessage()        — per-message handler in dispatcher.js
  │   ├─ streamer.js        — streaming state machine (idle→live→finalized, no-edit mode)
  │   ├─ sendToProcess()    → pm.send() → SdkProcess.send() → SDK Query
  │   └─ deliverReplies()   — chunked Telegram send with reply quoting
  ├─ ProcessManager         — LRU collection of Process instances (SDK or CLI backend)
  │   └─ SdkProcess         — one @anthropic-ai/claude-agent-sdk Query per chat
  │       └─ pendingQueue   — FIFO turn queue, idle timer with resetIdleTimer
  ├─ process-guard.js       — PID file, orphan detection (SIGTERM→SIGKILL), safety handlers
  ├─ slash-commands.js      — /model, /effort, /cd, /context, /compact, /new, /reset, pair cmds
  ├─ callbacks.js           — SDK event → polygram wiring (onStreamChunk, onToolUse, …)
  ├─ edit-correction.js     — mid-turn edit injection via pm.injectUserMessage
  ├─ edit-redelivery.js     — post-turn edit re-dispatch as new turn
  ├─ auto-resume.js         — cooldown-gated auto-resume on timeout/kill
  └─ config.json            — per-chat config (model, effort, cwd, timeout, allowedSenders…)
```

**Key invariants:**
- One SDK Query per chat (warm, reused across turns)
- `pm.send()` is serialized per session via `stdinLock` — prevents Claude batching multiple user messages
- ProcessManager LRU eviction skips inFlight sessions and sessions with live background jobs
- CLI backend (tmux + channels bridge) exists but SDK backend is the default

## Agent Architecture

The bot uses a custom **tg-router** agent (`~/.claude/agents/tg-router.md`, 233K★ Superpowers-inspired):
- **Subagent-First**: All non-trivial tasks → `Task(isolation="worktree", permissionMode="bypassPermissions")`
- **Karpathy's 4 Principles**: Think first, simplest thing, surgical changes, verify
- **Multi-Round Verification Loop**: Subagent internal self-check → main agent gate review
- **Auto-Skill Pipeline**: brainstorming → planning → subagent → code-review → verify → simplify → merge
- **Research Pipeline**: research + cross-verify-search + double-check auto-fire before any factual decision
- **Long-Running Monitors**: Background subagents that watch deployed features (sync, API, scraper) and self-heal
- **Project Management**: Auto-creates `~/projects/{name}/` with CLAUDE.md + PROJECT.md

Agent config is in `config.json` → `pairedChatDefaults.agent: "tg-router"`. Hot-reloaded on change.

## Approval System

Sensitive operations are gated behind approval cards sent to admin DM:
- `Bash(sudo *)`, `Bash(rm -rf *)`, `Bash(curl * | sh)`, `Bash(> /dev/*)`
- `Write(~/.claude/*)`, `Write(~/.hermes/*)`
- `Edit(~/.claude/settings.json)`, `Edit(~/.zshrc)`, `Edit(~/.ssh/*)`
- `Task(computer-use-*)`, browser/computer-use MCP tools
- All other tools → `bypassPermissions` (no approval needed)

Config: `config.bot.approvals.gatedTools`. Admin taps Allow/Deny in DM.

## Common Modifications

**Adding a slash command**: 1) Add to `ADMIN_CMD_RE` in `gate-inbound.js`, 2) Add handler in `slash-commands.js`, 3) Sync to git repo

**Tuning streaming**: `streamMinChars` (threshold to go live), `streamThrottleMs` (edit/new-message rate), `maxLen` (Telegram's 4096 cap) — all in `streamer.js`

**Config hot-reload**: Modify `config.json` → 2s debounce → `activeBotConfig()` reload → `syncCommands()` re-scan. No restart needed for config or plugin changes.

**Source hot-reload**: Any `.js` file change in `lib/` → 3s debounce → `SIGTERM` → launchd restarts. Graceful: completes in-flight turns first.

## Running

```bash
cd ~/polygram && polygram --bot main-bot
# Or via launchd (auto-restart on crash):
# tmux new -s polygram "cd ~/polygram && polygram --bot main-bot"
```

Logs: `~/polygram/logs/main-bot.log`
DB: `~/polygram/main-bot.db` (SQLite, source of truth for messages + sessions)
Config: `~/polygram/config.json` (hot-reloaded on change)
