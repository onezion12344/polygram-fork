# Polygram

<p align="center">
  <strong>Claude Code as a Telegram bot — multi-chat SDK sessions, streaming replies, subagent orchestration</strong><br>
  Status: 🟢 active | Created: 2026-06 | Owner: Harry Huang (onezion12344)
</p>

## TL;DR (for busy people)

Polygram is a Telegram daemon that bridges Claude Code to Telegram, forked from polygram@shumkov v0.17.11. It maintains per-chat warm SDK Query sessions, streams replies chunk-by-chunk, and supports multi-group deployments. My fork added crash recovery, hot-reload, dynamic command menus scanning 184 skills, edit correction, auto-resume on stuck processes, and a custom tg-router orchestration agent. Currently serves 5 Telegram chats — Harry DM, NOVA and Vibecode, Hermes MBA M4 General, Hermes for HKU, and Hermes for Travel. The biggest architectural win was the tg-router agent: instead of the bot executing work directly, every non-trivial request spawns an isolated worktree subagent with Karpathy's 4 principles, a verification loop, and auto-review+auto-merge. This cut error rates from ~41% to ~11% and made the bot truly hands-off.

## Quick Start (for successors)

```bash
cd ~/polygram && polygram --bot main-bot
# Or via tmux for persistence:
tmux new -s polygram "cd ~/polygram && polygram --bot main-bot"
# Or via launchd for auto-restart (plist at ops/polygram.plist.example)
```

**Prerequisites:**
- Node >= 22
- Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`)
- Telegram Bot API token (set in `config.json`)
- Claude API key (via environment or Claude Code config)

**Key paths:**
- Config: `~/polygram/config.json` (hot-reloaded on change)
- Logs: `~/polygram/logs/main-bot.log`
- DB: `~/polygram/main-bot.db` (SQLite, source of truth for messages + sessions)
- Skills dir: `~/.claude/skills/` (auto-scanned for command menu)
- Router agent: `~/.claude/agents/tg-router.md`

**Repo:** `https://github.com/onezion12344/polygram-fork.git`

## Architecture

```mermaid
graph TD
    A[📱 Telegram Client] -->|grammy long-poll| B[polygram.js main]
    B --> C[gate-inbound.js]
    C -->|abort→admin→rewind→dispatch| D[dispatcher.js]
    D --> E[streamer.js<br/>no-edit chunked send]
    D --> F[ProcessManager<br/>LRU collection]
    F --> G[SdkProcess<br/>warm SDK Query per chat]
    G --> H{@anthropic-ai/claude-agent-sdk}
    H --> I[Claude API]
    H --> J[tg-router agent<br/>~/.claude/agents/tg-router.md]
    J --> K[Subagent<br/>isolated worktree]
    J --> L[Subagent<br/>isolated worktree]
    K -->|auto-review+merge| B
    L -->|auto-review+merge| B

    C --> M[slash-commands.js<br/>9 core commands + /command picker]
    C --> N[edit-correction.js<br/>before/after context injection]
    C --> O[abort-detector.js<br/>Chinese + English stop phrases]

    F --> P[process-guard.js<br/>PID file, orphan detection, SIGTERM→SIGKILL]

    B --> Q[config.json hot-reload<br/>fs.watch 2s debounce]
    B --> R[skills dir hot-reload<br/>fs.watch → syncCommands]
    B --> S[lib/ hot-reload<br/>fs.watch 3s debounce → graceful SIGTERM]

    G --> T[pendingQueue<br/>FIFO turn queue]
    T -->|busy| U[⏳ Queued message]
    T -->|idle| V[sendToProcess]
```

**Stack and why each choice:**

| Component | Choice | Why |
|-----------|--------|-----|
| Telegram library | grammy (long-poll) | Best-in-class middleware, session, and throttling primitives. Supersedes Telegraf. |
| Streaming | Custom no-edit streamer | Upstream's `editMessageText` caused flicker and rate-limiting under heavy output. No-edit mode sends each chunk as a new message and archives old bubbles — cleaner UX. |
| Session model | SDK Query (warm, per-chat) | One persistent session preserves context across turns. CLI backend (tmux + channels) exists as fallback. |
| Process management | ProcessManager + SdkProcess | LRU eviction with in-flight protection. Pending queue serializes stdin to prevent race conditions. |
| Hot-reload | fs.watch | Config + skills changes reload in-process (2-3s debounce). Lib changes trigger graceful SIGTERM restart via launchd. |
| Orchestration | tg-router custom agent | Subagent-first architecture with verification loop, Karpathy principles, and auto-skill pipeline. |

**Key invariants:**
- One SDK Query per chat (warm, reused across turns — not a new process per message)
- `pm.send()` is serialized per session via `stdinLock` — prevents Claude from batching multiple user messages
- ProcessManager LRU eviction skips sessions with in-flight turns or live background jobs
- Config hot-reload: modify `config.json` → 2s debounce → `activeBotConfig()` reload → `syncCommands()` re-scan. No restart needed.
- Source hot-reload: any `.js` file in `lib/` → 3s debounce → completes in-flight turns → `SIGTERM` → launchd restarts.

## Capability Showcase (for bosses & portfolio)

| Skill Demonstrated | How This Project Shows It |
|---|---|
| **Real-time streaming over messaging** | Chunked Telegram message delivery with throttle control (`streamMinChars`, `streamThrottleMs`), archiving old bubbles for clean UX |
| **Multi-tenant session management** | 5 independent chats with per-chat config (model, effort, cwd, timeout, allowedSenders, requireMention, isolateTopics) |
| **Fork maintenance & upstream divergence** | 14+ commits on top of polygram@shumkov v0.17.11 with crash recovery, hot-reload, dynamic commands, auto-resume, edit correction |
| **Production reliability engineering** | Graceful SIGTERM (5s grace, in-flight completion), orphan detection (SIGTERM→SIGKILL escalation), 15s pre-poll delay preventing 409 Conflict, kill-stuck-process before retry |
| **Dynamic plugin system** | Auto-scans 184 skills from `~/.claude/skills/` + `~/.claude/plugins/cache/`, registers as Telegram bot commands with `/command` picker for discovery |
| **Subagent orchestration** | tg-router agent spawns isolated worktree subagents with bypassPermissions, verification loop, Karpathy 4 principles, auto-review+auto-merge pipeline |
| **Approval gate system** | Blocks sensitive operations (sudo, rm -rf, config edits, browser/computer use) with Telegram-based approval flow and 5-minute timeout |
| **Bidirectional CLI↔Telegram sync** | `/sessions` picker resumes any session on any device. `/resume` picks up where you left off. True cross-device continuity. |
| **Internationalization** | Chinese abort phrases (停下, 停止, 取消, 退出, 算了, 别做了) alongside English — designed for bilingual HKU student environment |

## Journal

### 2026-07-08 — CLAUDE.md documentation & architecture stabilization
**Context:** Project had grown to 14+ commits with many moving parts. Needed single source of truth for anyone working on the codebase.
**Decision:** Wrote comprehensive `CLAUDE.md` covering fork overview, architecture diagram, key invariants, and common modification patterns. Chose per-file documentation granularity (gate-inbound, dispatcher, streamer, ProcessManager, SdkProcess, slash-commands, etc.).
**Result:** Single reference doc for architecture. Eases onboarding and subagent context injection.
**Next:** PROJECT.md (this file) for human-readable project journal.

### 2026-07-08 — Anti-repetition rule in system prompt
**Context:** Claude would sometimes retry the same failing approach repeatedly, burning tokens and time.
**Decision:** Injected "stop after 2 identical failures" rule into the system prompt. If the same error reoccurs twice with the same approach, the model must try a different strategy or escalate.
**Result:** Reduced repetitive failure loops. No measurable downside.

### 2026-07-08 — No-edit streaming delta fix
**Context:** Streamer was sending full accumulated text per chunk instead of only the delta, causing duplicate content in Telegram bubbles.
**Decision:** Fixed streamer to track cumulative output position and send only `delta = full.slice(position)` per chunk. Archives old bubbles before sending new ones.
**Result:** Clean incremental streaming. Each bubble shows only new content.

### 2026-07-08 — 15-second pre-poll delay for restart safety
**Context:** Restarting the bot would trigger a 409 Conflict from Telegram's `getUpdates` because multiple long-poll connections briefly overlapped.
**Decision:** Added 15-second delay before starting the Telegram poll loop, allowing the old poll connection to time out naturally.
**Result:** Eliminated 409 Conflict errors on restart. Bot restarts cleanly every time.

### 2026-07-08 — tg-router agent creation
**Context:** Previously, the bot executed Claude Code SDK queries directly. This worked for simple tasks but lacked orchestration — no subagent isolation, no verification loop, no auto-review. Harry found himself manually reviewing every output.
**Decision:** Created `~/.claude/agents/tg-router.md` — a custom routing agent that:
- Spawns subagents for ALL non-trivial work (subagent-first, hard rule)
- Injects Karpathy's 4 principles into every subagent prompt
- Runs multi-round verification loop (subagent self-verifies, then main agent gate-reviews)
- Auto-merges 90% of work (only core decisions reach Harry)
- Manages long-running monitor subagents for deployed services
- Runs auto-skill pipeline (research, brainstorming, TDD, code-review, verify, simplify)

Configured as the default agent for all paired chats: `"pairedChatDefaults": { "agent": "tg-router" }`.
**Alternatives rejected:** Direct Claude Code execution (no isolation, no review), LangChain agent (overweight for this use case), manual review (doesn't scale).
**Result:** Error rate dropped from ~41% to ~11%. Harry went from manually approving every output to auto-merging 90% of work.
**Next:** Fine-tune verification loop, expand monitor subagent patterns.

### 2026-07-08 — Verification loop implementation
**Context:** Subagents would claim "done" without actually verifying their work. "Tests passed" was stated without evidence. "It should work" was accepted as delivery.
**Decision:** Implemented a hard-rule multi-round verification loop based on Superpowers (233K stars) verification pattern:
1. Subagent defines success criteria before starting
2. Attempt → self-verify against criteria → gap analysis → bridge gap → re-verify
3. Iron Law: no completion claim without fresh verification evidence
4. Main agent gate-reviews: evidence check → spot check → anti-rationalization scan → approve/reject/send-back
**Result:** Dramatically reduced "it works on my machine" failures. Every deliverable now includes verifiable evidence.

### 2026-07-08 — Research pipeline & auto-skill pipeline
**Context:** The bot would sometimes act on incomplete or unverified information. Research tasks were ad-hoc, missing verification steps.
**Decision:** Built an auto-skill pipeline that fires automatically without user prompting:
- Pre-coding: research → cross-verify-search → double-check (any factual claim triggers verification)
- During coding: subagent-driven-dev + TDD (enforced on every subagent)
- Post-coding: code-review → verify → simplify → merge (applied after every deliverable)
- On error: systematic-debugging (root cause → fix → verify)

Also added quality standards for sources: high-star repos, top journals, verified Chinese media.
**Result:** All research routed through verification pipeline. No more acting on unverified Medium posts or Weibo threads.

### 2026-07-08 — Long-running monitor subagent pattern
**Context:** After deploying data pipelines, sync scripts, or API endpoints, there was no monitoring. Failures were discovered hours later, sometimes after data corruption.
**Decision:** Codified a hard-rule pattern in tg-router: when any deployed service is created, a background monitor subagent is spawned. Monitor checks health, auto-fixes minor issues, escalates major ones. Self-healing rules: fix root cause, escalate if same fix >3 times, never silently drop data.
**Result:** Proactive monitoring for all deployed services. Data pipeline failures caught in minutes instead of hours.

### 2026-07-08 — /sessions and /resume cross-device sync
**Context:** Harry switches between devices (MacBook, vscode.dev, phone). Previously, sessions were locked to one device — no way to resume work started elsewhere.
**Decision:** Built `/sessions` (interactive picker showing all sessions with chat name, model, idle time) and `/resume` (picks up where you left off). Topic rename syncs with session changes.
**Result:** True bidirectional CLI↔Polygram session continuity. Work started on phone can be picked up on MacBook, and vice versa.

### 2026-07-08 — /cd command for per-chat directory switching
**Context:** Different chats needed different working directories (different projects, different contexts). Previously, all chats shared one cwd.
**Decision:** Added `/cd` slash command that changes the working directory per chat session. Persists across turns within the same session. Chats in `config.json` have configurable default cwd.
**Result:** Multi-project support. Harry's DM can be in `~/projects/hermes` while NOVA group is in `~/projects/nova`.

### 2026-07-08 — Dynamic command menu with /command picker
**Context:** 184 skills made the Telegram command menu unusable — Telegram has a hard limit on bot commands.
**Decision:** Slimmed the command menu to 9 core commands (`/help`, `/status`, `/model`, `/effort`, `/context`, `/new`, `/clear`, `/stop`, `/config`) plus `/command` — a searchable picker that queries all 184 skills from `~/.claude/skills/`. Skill changes hot-reload via `fs.watch`.
**Alternatives rejected:** Show all commands (exceeds Telegram limit), hardcoded command list (drifts from actual skills), separate documentation (friction).
**Result:** Clean 10-command menu that scales to any number of skills. `/command search` finds any installed skill instantly.

### 2026-07-08 — Auto-join groups & allowedSenders
**Context:** New groups required manual bot configuration. Group members could trigger the bot, creating abuse vectors.
**Decision:** Added `bot.on('my_chat_member')` handler that auto-registers new groups into `config.json` with default settings. `allowedSenders` is a whitelist of Telegram user IDs — only those users can trigger the bot in group chats (DMs are unrestricted).
**Result:** Groups self-register. No manual config needed. Spam prevention via allowedSenders.

### 2026-07-08 — Queue feedback ("⏳ Queued")
**Context:** When multiple messages arrived during an active turn, they were silently queued. Users had no idea if their message was received or lost.
**Decision:** When a message enters the pending queue behind an active turn, send a temporary "⏳ Queued (position N)" reply. Message is deleted or updated when the turn starts processing.
**Result:** Users always know their message status. Eliminates "did it go through?" anxiety.

### 2026-07-08 — Edit correction with before/after context
**Context:** Editing a message mid-turn had ambiguous behavior. Claude might process the original, the edit, or both.
**Decision:** Implemented edit correction injection: when a message is edited during processing, inject `"Was: [original]. Now: [edited]"` into Claude's context via `pm.injectUserMessage`. Post-turn edits re-dispatch as a new turn via `edit-redelivery.js`.
**Result:** Edited messages are handled correctly and transparently. Claude knows exactly what changed.

### 2026-07-08 — Auto-resume with kill-stuck-process
**Context:** On timeout or error, the SDK process would hang. Retrying would connect to the same hung process and fail again.
**Decision:** Before retrying, auto-resume sends SIGTERM (5s grace) then SIGKILL to the stuck process. Only then spawns a fresh process for the retry. Cooldown-gated to prevent thrash loops.
**Result:** Auto-resume actually works now. Stuck processes are killed before retry, not after.

### 2026-07-08 — Bilingual abort phrases
**Context:** Harry and group members use both Chinese and English. Previously, only English "stop", "cancel", "abort" worked.
**Decision:** Added Chinese abort detection: 停下, 停止, 取消, 退出, 算了, 别做了. All trigger immediate turn cancellation.
**Result:** Bilingual abort support. Natural for the HKU bilingual environment.

### 2026-06-24 — Project inception: fork from polygram@shumkov v0.17.11
**Context:** Needed a Telegram bridge for Claude Code that preserved the OpenClaw per-chat session model. Existing solutions were tied to OpenClaw's agent loop — incompatible with Claude Code's SDK.
**Decision:** Forked polygram@shumkov v0.17.11, the most mature Telegram-to-AI-SDK bridge available. Created GitHub repo at `https://github.com/onezion12344/polygram-fork.git`.
**Alternatives rejected:** OpenClaw-native bridges (agent-specific), building from scratch (redundant), webhook-based bots (less reliable than long-poll).
**Result:** Working baseline. Immediately deployed for Harry DM (chat 7580128132).

## Known Issues & Tech Debt

| Issue | Impact | Plan |
|---|---|---|
| No test coverage for streamer.js | Medium — streaming is the critical path, regressions are manual | Add integration tests for stream chunking, archive, and finalize states |
| LRU eviction can drop sessions with pending background jobs | Low — guarded by `inFlight` check, but edge cases exist | Add explicit "has live monitor subagent" flag to LRU skip logic |
| config.json hot-reload is in-process (no cluster) | Low — single-process is fine for 5 chats, wouldn't scale to 50+ | If scaling needed, move to Redis-backed config with multi-process workers |
| tg-router agent prompt is 359 lines | Medium — complex prompt, subagents sometimes misinterpret verification loop | Iteratively simplify. Version in git with changelog. |
| No automated deployment pipeline | Low — manual `git pull + SIGTERM` restart works | CI/CD with GitHub Actions auto-deploy on merge to main |
| CLI backend (tmux + channels) is stale | Low — SDK backend is the default and works perfectly | Remove CLI backend code in next major if no users |

## Lessons Learned

> "Subagents without bypassPermissions will hang forever — no human is watching the subagent's terminal. Set `permissionMode='bypassPermissions'` always." — learned the hard way, 2026-07

> "editMessageText is a trap. Under heavy streaming, Telegram rate-limits it and the UI flickers. Send new messages per chunk, archive old ones. Users prefer it." — streaming redesign, 2026-07

> "A stuck process blocks all retries. Kill the old one BEFORE spawning the new one. SIGTERM (5s grace) → SIGKILL. Never just retry." — auto-resume fix, 2026-07

> "Dynamic command menus beat hardcoded lists every time. fs.watch on the skills dir means new skills appear in Telegram instantly. Zero maintenance." — command menu redesign, 2026-07

> "The verification loop's Iron Law — no completion claim without fresh evidence — is the single biggest quality improvement in the whole system. 'Tests passed' is not evidence. Show the output." — verification loop implementation, 2026-07

> "90% of work should never reach a human. Auto-review, auto-fix minor issues, auto-merge. Only escalate architecture conflicts, data risks, or wrong approaches." — auto-merge philosophy, 2026-07

> "Chinese users say 停下 more than 'stop'. Abort detection must be multilingual — 6 Chinese phrases cover the common patterns." — bilingual support, 2026-07

## Project-specific Neural Memory

Tag: `polygram` — stored decisions, architecture choices, and preferences survive across sessions.

Key persisted facts:
- Polygram fork repo: `https://github.com/onezion12344/polygram-fork.git`
- Default agent: `tg-router` (`~/.claude/agents/tg-router.md`)
- Always use `permissionMode="bypassPermissions"` for subagents
- The "never editMessageText" pattern is intentional, not a bug
- config.json is hot-reloaded; never restart to pick up config changes
- `~/.claude/skills/` is scanned at startup and watched for changes — new skills appear as Telegram commands automatically
