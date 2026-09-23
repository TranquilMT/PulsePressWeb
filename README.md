# PulsePress Static HTML5 News Website

This is a true multi-page static website. No build system, npm, database or server is required.

## Pages
- `index.html` — live front page
- `world.html` — world desk
- `local.html` — Malta/local desk
- `tech.html` — technology network
- `gaming.html` — gaming network
- `briefing.html` — four-desk Pulse Briefing
- `search.html` — live search
- `saved.html` — device-local saved stories
- `article.html` — internal story dossier

## Live internet news
The site fetches directly from the public GDELT DOC 2.0 and Context 2.0 APIs from the browser. No API key is used.

The feeds auto-refresh while a news page is visible. Refresh cadence can be changed in Reader Settings.

## Hosting
This repository is designed for GitHub Pages or any static web host.

## Article reading
PulsePress does not copy full publisher articles. The internal dossier combines the live headline, source metadata, short GDELT Context snippets and related coverage. The original source remains available as an attribution link.
