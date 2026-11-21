# Palmetto Six-Star — GTA VI Trophy Guide & Tracker

An offline, single-file-hostable **Grand Theft Auto VI** PlayStation 5 trophy guide and
progress tracker for the make.fun `gta6-trophy-guide-01` bounty. It covers all **55
trophies** (1 Platinum · 2 Gold · 6 Silver · 46 Bronze), keeps every official name,
description and grade verbatim, and pairs each trophy with a cited guide written for
this entry.

No network requests at run time, no Rockstar artwork — the look is our own.

## What it does

- **Tracker** — checklist of all 55 with P/G/S/B grade chips, saved to `localStorage`,
  export/import as JSON, a **CSV export**, PSN-style points total, and a progress bar.
- **Filters** — All / Story (12) / Missable / Collectibles / Activities / Online (0) /
  PSN-hidden (28) / Disputed / Not earned, plus grade and free-text search.
- **Spoiler shield** — hides story-trophy names and descriptions until earned or
  revealed; PSN-hidden trophies stay covered the same way (on by default).
- **Cited guides** — every guide shows the official description, then numbered steps,
  each specific fact tagged with its source `[n]`. Where sources disagree, a
  `SOURCES DIFFER — both versions shown` box shows both, plus an **Our call** line.
- **Next-up recommender** — a right-rail panel that surfaces the next unearned story
  trophy in roadmap order plus the closest-to-done collectible set, with one-click
  jumps to each guide.
- **Session planner** — a new tab where you build a play plan from the five roadmap
  stages, see each stage's steps with time estimates, and tick steps off in-session.
  Plan progress is saved separately from the main checklist.
- **Roadmap** — 5 stages, ordered steps with citations, time/difficulty estimates
  (~200 h, 4/10, 1 playthrough, 0 online, 1 possible missable), and a missable watch.
- **Missables** — the one possibly-missable trophy (Positive Mental Attitude) plus an
  at-risk watch list with last-chance chapters.
- **Sources tab** — a methodology note plus every source with URL, pages read,
  claims cited and read date.

## Run it

```bash
node main.ts
# then open http://127.0.0.1:8080
```

`node main.ts --port <n>` serves `app/` on another port, and `--host 0.0.0.0`
binds every interface for LAN access. The server is standard-library-only and
prints the listening address plus a short route list on startup. The app makes
**zero** network requests at run time — it works fully offline.

## Data

- `app/data/trophies.json` — the official 55-trophy list with authored cited guides,
  hidden flags, kinds, missable/at-risk flags, counts, roadmap stages, and the
  `plannerTemplates` section the Session planner reads.
- `app/data/sources.json` — the cited source registry plus the `methodology`
  note shown on the Sources tab.

## Credits / sources

Guides are our own words, built from public references read on **21 Nov 2026**:

- PowerPyx — GTA 6 Trophy Guide & Roadmap
- PowerPyx — GTA 6 100% Completion Checklist
- GTADB (GTABase) — GTA 6 Trophies & Platinum Guide
- GameMapa — All 55 GTA 6 Trophies
- eGamers.io — GTA 6 Trophy List
- GTA Scoop — GTA 6 Trophies & Achievements
- One More Game — Grand Theft Auto VI Trophy List
- Exophase — Grand Theft Auto VI PS5 Trophies

Where sources disagree we show both versions and never present an unconfirmed claim
as fact.

## License

MIT — see [LICENSE](./LICENSE).

---

[![make.fun gta6-trophy-guide-01](https://make.fun/badge/gta6-trophy-guide-01.svg)](https://make.fun/bounty/gta6-trophy-guide-01)
[![rank](https://make.fun/badge/gta6-trophy-guide-01/1462919984-byte/gta6-trophy-guide/rank.svg)](https://make.fun/bounty/gta6-trophy-guide-01)
[![reward](https://make.fun/badge/gta6-trophy-guide-01/1462919984-byte/gta6-trophy-guide/reward.svg)](https://make.fun/bounty/gta6-trophy-guide-01)
