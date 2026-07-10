---
name: publish-project
description: Polish a project for public release — update GitHub description, rewrite README with architecture diagram and feature table, generate hero banner, record demo video, push everything. Triggered by "publish", "polish GitHub", "make it public-ready", "open source this".
version: 1.0.0
tags: [github, documentation, design, video, release]
allowed_tools:
  - Bash
  - Read
  - Write
  - Edit
  - Skill
  - WebSearch
  - WebFetch
---

# Publish Project — Public-Ready in One Shot

Turn a private repo into a polished open-source project.

## Pipeline

```
1. GitHub metadata
   gh repo edit --description "..." --homepage "..."
   gh repo edit --add-topic "claude-code" --add-topic "telegram" ...

2. README overhaul
   - Hero section with one-line pitch
   - Architecture diagram (Mermaid)
   - Feature table (scannable)
   - Quick Start (≤5 steps)
   - Project docs table

3. Hero banner (HTML)
   - 1280×640 social preview card
   - Dark theme, pipeline flow, tag cloud
   - Open in browser, screencapture to hero.png
   - Save to assets/hero.png

4. Demo video (30-60s)
   - Screen recording via onezion-video (方案A: screencapture)
   - Show: TG → bot processes → subagent → result
   - Upload to assets/demo.mp4

5. Push everything
   git add README.md assets/ docs/ && git commit -m "release: public-ready"
   git push origin main
```

## After Publishing

- Set repo to public if it was private
- Add repo to your personal website / portfolio
- Post on X/LinkedIn with the hero image
