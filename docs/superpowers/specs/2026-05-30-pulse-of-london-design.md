# Pulse of London — Design Spec

- **Date:** 2026-05-30
- **Status:** Approved (brainstorm complete) → ready for implementation plan
- **Working name:** "Pulse of London" (final public name TBD — must be clearly independent of TfL)

## 1. Summary

A free, public website showing a **live geographic map of London's rail network**, where stations and
lines are coloured and ranked by **how far the current moment deviates from the typical pattern for this
day-and-time** — answering *"is it unusually bad right now, and where?"* A short, explainable headline sits
on top ("busier and a bit more disrupted than a typical Friday evening").

The distinctive idea ("the soul") is the **bi-directional, baseline-relative crowding signal**: a station is
only "red" if it is busier *than usual for this time*, not merely busy. An empty platform at 03:00 reads as
normal, not alarming.

Built entirely on the [TfL Unified API](https://api.tfl.gov.uk/) open data, within its terms of service.

## 2. Goals / Non-goals

**Goals**
- A genuinely useful, glanceable, *exploratory* read on the network's health right now.
- Anomaly-first: surface the unusual, not the obvious.
- Honest about data: never fabricate a signal we don't have.
- ToS-compliant by construction (caching, attribution, independent branding, secret key).
- Accessible to WCAG 2.2 AA as a hard requirement.

**Non-goals (v1)**
- Not a journey planner or a replacement for TfL Go / Citymapper.
- No personal accounts, no PII, no login.
- Not real-time-to-the-second; ~1–5 min freshness is fine and matches the upstream data.

## 3. Users & use cases

Londoners deciding **whether / when** to travel, and the data-curious. Primary moments:
- "Is the network a mess today — should I leave now, wait, or work from home?"
- "Is my usual line unusually busy or disrupted right now?"
- A shareable daily "state of the network" snapshot.

Personal/saved-journey features are **iceboxed** (see §13); the architecture must not preclude them.

## 4. The signal — anomaly model

### 4.1 Data semantics (verified)
- **Live crowding** `GET /crowding/{naptan}/Live` → `{ dataAvailable, percentageOfBaseline (~0–1), timeUtc, timeLocal }`.
  `percentageOfBaseline` = current busyness as a fraction of the station's **all-time peak** since 2019.
  This is absolute-ish busyness, **not** an anomaly by itself.
- **Typical crowding** `GET /crowding/{naptan}/{dayOfWeek}` → the typical pattern in **15-minute bands** for
  that weekday. Static-ish; refreshed daily.
- **Line status** `GET /Line/Mode/{modes}/Status?detail=true` → per-line `statusSeverity`,
  `statusSeverityDescription`, and disruptions. One call covers all rail lines.

### 4.2 The anomaly (computed by us)
For each tube station, for the current weekday + 15-min band:

```
anomaly = live.percentageOfBaseline / typical.percentageOfBaseline
```

Initial bands (tunable, documented as defaults):

| ratio | band | meaning |
|---|---|---|
| `< 0.6` | `much_quieter` | far quieter than usual |
| `0.6 – 0.85` | `quieter` | quieter than usual |
| `0.85 – 1.15` | `normal` | as expected |
| `1.15 – 1.4` | `busier` | busier than usual |
| `> 1.4` | `much_busier` | far busier than usual |

Edge cases: `typical == 0` or missing band → `unknown` (rendered neutral, never red);
`dataAvailable == false` or one of the 3 crowding-less stations → `unknown`.

### 4.3 Line + network signals
- **Line colour** = live status severity (v1): Good Service → green, Minor Delays → amber,
  Severe/Part Suspended/Suspended → red. (Status *anomaly* — "more disrupted than usual" — is iceboxed; see §13.)
- **Network headline** = honest aggregate of (a) network-wide crowding anomaly (the **median of available
  station ratios** — initial default, tunable) and (b) a disruption summary (count + worst lines). Components
  are shown so the verdict is explainable, not a black box.

## 5. Data sources (TfL Unified API endpoints)

| Endpoint | Purpose | Cadence |
|---|---|---|
| `/Line/Mode/{modes}/Status?detail=true` | live status + disruptions, all rail lines | ~1 call / min |
| `/crowding/{naptan}/Live` | live busyness per tube station (~270) | ~270 calls / 5 min |
| `/crowding/{naptan}/{dayOfWeek}` | typical 15-min baseline per station | ~270 calls / day |
| `/StopPoint/Mode/tube` | station list + coordinates + naptan IDs | static (rare) |
| `/Line/{id}/Route/Sequence/{direction}` | line geometry (lineStrings) for drawing | static (rare) |

Modes drawn on the map: **tube, Overground, Elizabeth line, DLR, tram.** Crowding anomaly is **tube-only**
(that is where live crowding exists). Buses are **not drawn** (700+ routes = visual chaos); an aggregate bus
disruption count is a possible minor extra, otherwise iceboxed.

## 6. Architecture — Snapshot + CDN

Two cleanly separated halves; the frontend never talks to TfL.

```
TfL API ──(scheduled poll)──► Ingestor ──► snapshot.json (object store, CDN-fronted)
                                                    │
                                static frontend ◄───┘  (polls the snapshot URL)
```

- **Ingestor (scheduled poller, server-side):** polls TfL → computes anomalies → writes **one snapshot JSON**.
  The `app_key` lives only here.
- **Frontend (static):** fetches the snapshot, renders the map + panels. Knows nothing about TfL.

**Hosting (recommendation, finalise in plan):** static frontend + object store/CDN (e.g. Cloudflare Pages +
R2). The poller likely runs as a **scheduled GitHub Action / Vercel / Netlify cron** rather than a Cloudflare
Worker, because ~270 crowding calls/cycle exceeds the Workers free **50-subrequest** cap. The *pattern* is
fixed; the exact poller host is an open question (§14) because of the trade-off between cron granularity
(status freshness) and per-invocation limits.

## 7. Components (isolated, testable units)

### Ingestor
| Unit | Responsibility | Interface (sketch) |
|---|---|---|
| `Fetchers` | thin TfL HTTP wrappers, one per endpoint | `fetchLineStatus(modes) → RawStatus[]`, `fetchLiveCrowding(naptan) → RawLive`, etc. |
| `TypicalBaselineStore` | cache per-station 15-min typical patterns; refresh daily | `typicalFor(naptan, weekday, band) → number \| undefined` |
| `AnomalyEngine` | **pure functions** — the heart | `crowdingAnomaly(live, typical) → {ratio, band}`, `lineHealth(status) → {severity, colourToken}`, `networkScore(stations, lines) → NetworkSummary` |
| `SnapshotBuilder` | assemble the versioned snapshot object | `build(status, crowding, baseline, geometryMeta) → Snapshot` |
| `Writer` | persist snapshot to object store; stable URL, short edge TTL | `write(Snapshot) → void` |
| `SnapshotLogger` | append compact daily history (seeds future status-anomaly) | `append(SnapshotSummary) → void` |

### Frontend
| Unit | Responsibility |
|---|---|
| `SnapshotClient` | fetch + poll the snapshot every ~30–60s; expose `fresh \| stale \| error` state |
| `MapView` | MapLibre GL; **dark** canvas + Thames outline; line layers from static geometry; station nodes by anomaly |
| `HeadlinePanel` | the network verdict + components; shareable |
| `DetailPanel` | tap a line/station → status, disruptions, live-vs-usual |
| `ListView` | accessible, sortable "worst-first" table of lines/stations (AA fallback + keyboard view) |
| `Legend` / onboarding | one line explaining "red = busier *than usual*" |
| `AttributionFooter` | required TfL/OS/Geomni lines + "Unofficial — not affiliated with TfL" |

**Static assets** (built once, CDN-served): route-geometry GeoJSON, Thames/coastline GeoJSON.

## 8. Snapshot JSON schema (the single contract between halves)

```jsonc
{
  "schemaVersion": 1,
  "generatedAt": "2026-05-30T18:10:05Z",
  "freshness": { "statusAgeSec": 42, "crowdingAgeSec": 130 },
  "network": {
    "crowdingAnomaly": 1.18,
    "disruptedLineCount": 3,
    "verdict": "busier_than_usual",          // enum
    "headline": "Busier and a bit more disrupted than a typical Friday evening",
    "worstLines": ["central", "victoria"]
  },
  "lines": [
    { "id": "victoria", "name": "Victoria", "mode": "tube",
      "statusSeverity": 10, "statusDescription": "Good Service",
      "disruptions": [], "crowdingAnomaly": 1.25 }   // null for non-tube
  ],
  "stations": [
    { "naptan": "940GZZLUVIC", "name": "Victoria", "lat": 51.4965, "lon": -0.1447,
      "lines": ["victoria", "circle", "district"],
      "live": 0.62, "typical": 0.48, "anomaly": 1.29,
      "anomalyBand": "busier", "dataAvailable": true }
  ]
}
```

`schemaVersion` lets the frontend fail gracefully on mismatch.

## 9. Data flow & rate-limit math (ToS-safe by design)

- Status: **1 call / min**. Crowding: **~270 / 5 min ≈ 54/min** (crowding only updates every 5 min).
  Typical baseline: **~270 / day**. Geometry/stations: static.
- **Steady state ≈ 55 calls/min from a single poller, independent of visitor count** — far below the
  **500/min/feed** limit. Visitors only ever hit the CDN.

## 10. Design system — "elegant" theme (typeui.sh)

Applied as design tokens up front. **Light chrome + dark map hero**: the elegant *light* theme drives the
headline, panels, legend and footer; the **map canvas is dark** so the anomaly "pulse" pops.

- **Type:** Google Sans (body/display), Anonymous Pro (mono). Scale 14 / 16 / 18 / 24 / 32 / 40px. Weights 100–600.
- **Spacing:** 4px base — 4 / 8 / 12 / 16 / 24 / 32.
- **Semantic colour tokens** (drive both UI and data):
  - Primary `#3B82F6`, Secondary `#8B5CF6`, Success `#16A34A`, Warning `#D97706`, Danger `#DC2626`,
    Surface `#FFFFFF`, Text `#111827`.
- **Data → colour mapping** (tuned for the dark map):
  - **Line status:** Success (good) / Warning (minor delays) / Danger (severe/suspended).
  - **Crowding anomaly:** `much_busier`→Danger, `busier`→Warning, `normal`→neutral/dim,
    `quieter`→Primary, `much_quieter`→lighter Primary; `unknown`→neutral.
- **Motion:** smooth transitions — animate node colour/size between snapshots so the map feels alive.
- **Mood:** refined, spacious, intentional.

## 11. Accessibility (WCAG 2.2 AA — hard requirement)

- **Anomaly is never colour-only:** encode redundantly via node **size** (∝ deviation), a **direction glyph**
  (up = busier, down = quieter), and **text labels** in the detail panel.
- **`ListView`** provides a full non-map, keyboard-navigable, screen-reader-friendly equivalent of all map data.
- Visible focus states, full keyboard navigation, adequate contrast on both light chrome and dark map.
- ARIA labels e.g. *"Victoria — busier than usual (live 62% of peak vs typical 48%)."*

## 12. ToS compliance (baked in)

- **Attribution** always visible in `AttributionFooter`:
  - "Powered by TfL Open Data"
  - "Contains OS data © Crown copyright and database rights [year]"
  - "Geomni UK Map data © and database rights [year]"
  - *(`[year]` = the specific years stated in TfL's current terms, filled at build time)*
  - "Unofficial — not affiliated with or endorsed by Transport for London."
- **Independent branding:** original name, no roundel, no implication of official status.
- **Secret `app_key`:** server-side only (the ingestor); never shipped to the browser.
- **Caching:** cache-and-serve-once polling; visitors hit the CDN, not TfL.
- **No scraping** of the Oyster / Congestion Charging / Santander Cycles websites — Unified API only.
- **Licence:** OGL v2.0 + TfL branding terms (accepted at API registration).
- Thames/coastline GeoJSON: attribute its source (e.g. ODbL if OpenStreetMap-derived).

## 13. Error handling & resilience

- Snapshot carries `generatedAt` + `freshness`. Frontend shows "updated Xs ago"; if the poller falls behind
  (e.g. snapshot > ~15 min old) it shows a clear **stale** banner — never presents old data as live.
- `dataAvailable: false` / crowding-less stations → render **"no live data"**, never a fabricated anomaly.
- Ingestor is resilient: a single station's failed fetch drops only that station (marked `unknown`); the
  cycle still ships. Status and crowding are fetched/cached independently so one failing doesn't sink the other.
- Frontend handles snapshot fetch failure (keep last good + stale banner) and `schemaVersion` mismatch.

## 14. Testing strategy

- **TDD the pure `AnomalyEngine`**: table-driven cases — ratio bands, `typical == 0`, missing band,
  `dataAvailable == false`, boundary values.
- **`SnapshotBuilder`**: golden tests — recorded TfL fixtures → expected snapshot JSON.
- **`Fetchers`**: contract tests against recorded fixtures; one optional live smoke test.
- **`SnapshotClient`**: unit-test the fresh/stale/error state machine.
- **Frontend smoke (Playwright):** load a mocked snapshot; assert headline renders, map has the expected
  layers, `ListView` matches, and **attribution is present**; basic a11y checks (focus, contrast, labels).

## 15. MVP scope (YAGNI)

**In v1**
- Rail-modes map (tube + Overground + Elizabeth + DLR + tram) from open geometry, dark canvas + Thames.
- Live line status + disruptions on tap.
- Tube crowding anomaly (bi-directional, baseline-relative).
- Network headline (crowding anomaly + disruption summary).
- Accessible `ListView`; legend/onboarding; attribution/branding.
- Snapshot + CDN pipeline; daily history logging (seeds the future status-anomaly).

**Iceboxed (explicitly out of v1)**
- Personal saved commutes / watchlist / "beat the crush" timing advice.
- **Status anomaly** ("more disrupted than usual") — needs accumulated history; we log from day 1, ship later.
- Predictive nudges; buses on the map; per-station arrivals; basemap toggle; dark/light user toggle; alerts;
  history replay.

## 16. Open questions (resolve in the plan)

1. **Poller host** — GitHub Actions vs Vercel/Netlify cron vs a small scheduled container, given the
   ~270-call/5-min volume and the cron-granularity ↔ status-freshness trade-off.
2. **Frontend framework** — vanilla TS + MapLibre (minimal) vs a thin reactive layer (e.g. Svelte).
3. **"Google Sans" licensing** — proprietary; use where licensed/available, else the closest open substitute.
   (Anonymous Pro is open via Google Fonts.)
4. **Final independent product name.**
5. **Thames/coastline GeoJSON source** + its attribution.
