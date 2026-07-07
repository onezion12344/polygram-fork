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
