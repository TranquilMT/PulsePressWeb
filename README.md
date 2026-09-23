# PulsePress

**PulsePress is an open-source, live digital newspaper for world news, Malta/local coverage, technology and gaming.** It is built entirely with static HTML5, CSS and vanilla JavaScript, so it can run directly on GitHub Pages without a backend, build system, npm install, database or paid news API.

PulsePress is designed to feel like a modern digital publication rather than a basic feed reader. It combines live internet news discovery with editorial layouts, source imagery, animated briefings, saved stories, specialist desks and an internal story-dossier experience.

## What PulsePress includes

- **Latest** — a mixed front page combining major World, Malta, Tech and Gaming stories.
- **World** — international politics, economy, diplomacy, climate, conflict and major breaking events.
- **Malta / Local** — Malta-focused reporting including Valletta, Mdina, Gozo and wider Maltese coverage.
- **Technology Network** — AI, cybersecurity, smartphones, computing, startups and emerging technology.
- **Gaming Network** — PlayStation, Xbox, Nintendo, PC, Steam, mobile gaming and esports coverage.
- **Pulse Briefing** — a four-desk dashboard combining World, Local, Tech and Gaming into one fast briefing.
- **Quick Pulse** — a rapid headline-browsing mechanic for scanning important stories.
- **Live Search** — search the current global news index for games, companies, people, locations or topics.
- **Saved Stories** — bookmarks stored locally on the reader's device.
- **Internal Story Dossiers** — live context, source metadata, related reporting and coverage telemetry without forcing the reader out of PulsePress.
- **Coverage Lens** — shows related-report counts, unique sources, countries represented, story age and momentum.
- **Advanced UI motion** — animated headline ticker, scroll reveals, page transitions, card effects and reading progress.
- **Responsive design** — built for phones, tablets and desktop browsers.
- **PWA support** — includes a web manifest and service-worker shell caching.

## Live internet news

PulsePress retrieves current reporting directly from the public **GDELT DOC 2.0** and **GDELT Context 2.0** APIs in the reader's browser.

No private API key is stored in this repository.

News pages automatically refresh while visible, and readers can choose the refresh interval in Reader Settings.

PulsePress does **not** republish full copyrighted publisher articles. The internal dossier uses headlines, source metadata, short contextual material and related coverage to create a navigation and discovery layer. Original publishers remain attributed and their original source URLs remain available.

## Technology

PulsePress deliberately keeps the stack simple and portable:

- HTML5
- CSS3
- Vanilla JavaScript
- Browser Fetch API
- LocalStorage
- Service Worker
- GDELT public news APIs
- GitHub Pages

There is no framework lock-in, server runtime or required package manager.

## Project structure

- `index.html` — live front page
- `world.html` — World desk
- `local.html` — Malta / Local desk
- `tech.html` — Technology Network
- `gaming.html` — Gaming Network
- `briefing.html` — Pulse Briefing
- `search.html` — live news search
- `saved.html` — saved-story library
- `article.html` — internal story dossier
- `assets/css/styles.css` — global design system and animations
- `assets/js/news.js` — live news/data layer
- `assets/js/site.js` — interface, navigation and interaction logic
- `sw.js` — service worker
- `manifest.webmanifest` — PWA metadata

## Hosting

The production target is **GitHub Pages** from the repository's `main` branch and repository root.

Expected public URL:

`https://tranquilmt.github.io/PulsePressWeb/`

## Open source

PulsePress is open-source software released under the **MIT License**.

You are free to:

- inspect the source code;
- fork the project;
- modify it;
- build your own version;
- redistribute it;
- use it in personal or commercial projects;

provided the MIT copyright and license notice is retained.

Contributions, fixes, design improvements, new desks and better news-discovery mechanics are welcome.

## License

Copyright © 2026 TranquilMT.

Licensed under the [MIT License](LICENSE).
