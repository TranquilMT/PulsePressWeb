# PulsePress

An open-source digital newspaper for world news, 15 country editions, technology and gaming. Read current publisher headlines with source images, short excerpts and clear links to original reporting.

**[Read PulsePress](https://tranquilmt.github.io/PulsePressWeb/)**

## Reading experience

- Country editions for the UK, France, Malta, USA, Germany, Italy, Spain, Ireland, Australia, Canada, India, Japan, Ukraine, China and South Africa.
- Top-news bulletin ranked by freshness, related coverage across publishers and position in publisher feeds. Rankings are not traffic figures: publishers do not supply article-level readership to PulsePress.
- Follow favourite sources, including Polygon and Times of Malta. Select **Following** on a desk to filter its reporting, or on the front page for all followed sources. Preferences are saved on the current device.
- Specialist technology reporting and gaming coverage from independent publications and official PlayStation and Xbox announcements.
- Game-update and patch filters, platform topics, and a rolling seven-day gaming highlight edition with publisher diversity. Highlights refresh with each newsroom run; they are an automated selection, not a claim of universal editorial consensus.
- Recent serious reports explicitly marked breaking by their publishers can appear in a Breaking strip. No artificial breaking labels or invented popularity counts.
- Search across the retained news index; save stories; open shareable article links; adjust reader text size, theme and motion.

## Fresh news and resilient loading

A GitHub Actions newsroom collects publisher RSS/Atom feeds every 15 minutes (at minutes 7, 22, 37 and 52), preserves recent reporting, and explicitly deploys a refreshed Pages artifact. GitHub can delay scheduled jobs, so exact delivery times are not guaranteed. The browser checks for published updates at the reader's selected interval and when the tab becomes visible again.

The app loads same-origin JSON immediately instead of waiting on browser cross-origin APIs. It retains the last successful edition when offline and displays the actual feed update timestamp. Individual failed sources do not discard successful publishers or refresh timestamps on wholly unavailable editions.

Article images come from publisher feed media or public social-preview metadata. Missing or blocked images use a publisher fallback. Times of Malta can fall back to attributed headlines from Google's public news index when its direct RSS feed is unavailable; index-only entries may lack excerpts and images. No paywalls are bypassed and complete publisher articles are not copied.

## Development

The reader uses static HTML, CSS and vanilla JavaScript. The newsroom uses Python 3.12 and its standard library; no keys or paid APIs are needed.

```sh
python3 scripts/update-news.py
python3 -m http.server 8123
```

`scripts/update-news.mjs` remains a Node-compatible wrapper around the Python updater.

- `assets/js/news.js`: same-origin editions, cache, search and related-story matching
- `assets/js/site.js`: reader, country selection, following and interface
- `scripts/update-news.py`: feed validation, excerpts, images, ranking and weekly highlights
- `data/`: current editions, source directory and retained article index
- `sources.html`: publisher directory and following preferences
- `.github/workflows/update-news.yml`: scheduled ingestion and explicit Pages deployment

## Source transparency

The directory identifies the publishers and current feed availability. Inclusion is not a guarantee that every report is correct. Official game-company blogs are identified as official announcements. Check the original report for corrections, full context and subscription requirements.

## Open source

PulsePress code is MIT licensed. Publisher headlines, excerpts, photographs and trademarks belong to their respective owners and are not covered by the code license. See [LICENSE](LICENSE).
