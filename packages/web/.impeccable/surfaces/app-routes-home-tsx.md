---
version: 1
slug: "app-routes-home-tsx"
primary_target: "app/routes/home.tsx"
related_targets: ["app/components"]
---

# Home (live network board)

Scope: the single public page (`app/routes/home.tsx` and its components). Visitor mode: **Operate**. The visitor completes one task: a phone glance to learn whether the network is unusually bad right now, and whether their line or station is affected. Desktop is the roomier exploring version.

Audience/job/constraints: see PRODUCT.md. Key surface constraints: WCAG 2.2 AA; two separate signals (line status vs station crowding deviation) must never share an encoding; unknown and stale are shown honestly; attribution and the unofficial notice are always present.

## Direction contract

THESIS: The network reads like the departure board on your platform. The verdict is the board's top line, and lines and stations are ranked rows, worst first. It refuses the category default of a dark neon map with stacked sidebar cards.

OWN-WORLD: Black board housing with hairline frame seams. Amber LED dot-matrix glyphs (Doto) are used for board copy and "TfL says" line alerts only. Crowding runs on a red↔blue deviation scale with grey for normal and a hollow ring for no data. Selection is the board's own inversion: an amber field with black glyphs, plus a white corridor glow on the map. Prose is in Atkinson Hyperlegible Next.

STORY: In one glance the visitor knows whether today is worse than usual and which lines are disrupted. They tap their line or station to see why, and trust the clock that says how fresh it is.

FIRST VIEWPORT: On a 390px phone, a housing strip carries the name, a ticking LED clock and the freshness readout. Below it, the LED verdict sits across the full width at the largest size, followed by the plain-language headline and one board line of network deviation and disrupted lines. The lit map fills the rest and leads into the ranked LINES board. Primary action: tap a row or a map feature.

FORM: UK station dot-matrix departure board, candidate 4 of 7 on the ordered list; seed key 08e6afbd. Signature interaction: on refresh, changed rows re-scan in place with an LED column wipe and keep a "changed" pip until seen. Disruption text runs beneath its row like "calling at" (static under reduced motion). Raises: tabular figures on every row (data field); one board module for row height, glyph grid and spacing (grid specimen); selecting a line focuses its corridor (transit diagram); selection has one reserved treatment (orienteering); LED type only at fixed whole steps (bitmap specimen); changed rows hold a marker until seen (gate board).

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Unresolved

- Line identity on the map is shown on selection and as labels, not through official line colours (brand commitment).
