# Polygram — Telegram Claude Code Bridge

Fork of polygram@shumkov with improvements:
- Stable crash recovery (timeout 300→600, SIGTERM 2s→5s)
- Dynamic command menu via Telegram setMyCommands
- Auto-join groups + admin-only @mention
- Edit correction with before/after context
- Queue feedback with auto-cleanup
- No-edit streaming (each step = new message)
- Hot-reload config + skills without restart
- Enhanced Chinese + English abort commands
- Auto-resume with stuck-process kill

## Quick Start
```bash
npm install -g polygram
cp config.example.json ~/polygram/config.json
# Edit config.json with your bot token and chat IDs
polygram --bot main-bot
```
