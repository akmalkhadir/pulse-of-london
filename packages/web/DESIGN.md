---
name: Pulse of London
description: London's rail network as a live platform departure board, measured against a typical day.
colors:
  housing: "#0b0c0e"
  panel: "#111317"
  panel-raised: "#171a1f"
  seam: "#23262c"
  seam-strong: "#33373e"
  led: "#ffb020"
  led-dim: "#c48c2c"
  led-bloom: "rgb(255 176 32 / 0.32)"
  ink: "#ece6da"
  ink-2: "#aba498"
  ink-3: "#8d877c"
  select-ink: "#0b0c0e"
  corridor: "#f5f1e6"
  band-much-busier: "#ff4d5e"
  band-busier: "#f0929b"
  band-normal: "#8a9099"
  band-quieter: "#86b9ea"
  band-much-quieter: "#3e9bff"
  band-unknown: "#6b7079"
  line-good: "#454b54"
  map-water: "#0c1824"
  map-place: "#5d626a"
  map-place-minor: "#474b52"
  map-station-label: "#d8d2c6"
typography:
  led-display:
    fontFamily: "Doto, ui-monospace, monospace"
    fontSize: "2.5rem"
    fontWeight: 900
    lineHeight: 1.05
    letterSpacing: "0.02em"
  led-display-wide:
    fontFamily: "Doto, ui-monospace, monospace"
    fontSize: "3.5rem"
    fontWeight: 900
    lineHeight: 1.05
    letterSpacing: "0.02em"
  led-title:
    fontFamily: "Doto, ui-monospace, monospace"
    fontSize: "1.5rem"
    fontWeight: 900
    lineHeight: 1.15
    letterSpacing: "0.04em"
  led-row:
    fontFamily: "Doto, ui-monospace, monospace"
    fontSize: "1.25rem"
    fontWeight: 800
    lineHeight: 1.15
    letterSpacing: "0.04em"
    fontFeature: "tnum"
  led-small:
    fontFamily: "Doto, ui-monospace, monospace"
    fontSize: "1rem"
    fontWeight: 800
    letterSpacing: "0.04em"
    fontFeature: "tnum"
  body-lg:
    fontFamily: "Atkinson Hyperlegible Next, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 400
    lineHeight: 1.5
  body:
    fontFamily: "Atkinson Hyperlegible Next, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
    fontFeature: "tnum"
  body-sm:
    fontFamily: "Atkinson Hyperlegible Next, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Atkinson Hyperlegible Next, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 400
    lineHeight: 1.5
rounded:
  board: "2px"
  pip: "50%"
spacing:
  space-1: "4px"
  space-2: "8px"
  space-3: "12px"
  space-4: "16px"
  space-5: "24px"
  space-6: "32px"
  space-8: "48px"
  row: "48px"
  column: "460px"
components:
  masthead:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.led-dim}"
    typography: "{typography.led-small}"
    padding: "8px 16px"
    height: "48px"
  board-head:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.led}"
    typography: "{typography.led-row}"
    padding: "8px 16px"
    height: "48px"
  board-row:
    backgroundColor: "transparent"
    textColor: "{colors.led}"
    typography: "{typography.led-row}"
    padding: "8px 16px"
    height: "48px"
  board-row-hover:
    backgroundColor: "{colors.panel-raised}"
  board-row-selected:
    backgroundColor: "{colors.led}"
    textColor: "{colors.select-ink}"
  detail-head:
    backgroundColor: "{colors.led}"
    textColor: "{colors.select-ink}"
    typography: "{typography.led-title}"
    padding: "12px 16px"
  detail-panel:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    padding: "16px"
    width: "400px"
  chip:
    backgroundColor: "{colors.housing}"
    textColor: "{colors.ink}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.board}"
    padding: "0 12px"
    height: "36px"
  chip-disrupted:
    textColor: "{colors.led}"
  board-control:
    backgroundColor: "{colors.housing}"
    textColor: "{colors.ink-2}"
    typography: "{typography.label}"
    rounded: "{rounded.board}"
    padding: "0 12px"
    height: "32px"
  segmented-button:
    backgroundColor: "{colors.housing}"
    textColor: "{colors.ink-2}"
    typography: "{typography.body-sm}"
    padding: "0 12px"
    height: "40px"
  segmented-button-pressed:
    backgroundColor: "{colors.panel-raised}"
    textColor: "{colors.led}"
  search-input:
    backgroundColor: "{colors.housing}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.board}"
    padding: "0 12px 0 34px"
    height: "40px"
  notice:
    textColor: "{colors.ink}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.board}"
    padding: "12px"
---

# Design System: Pulse of London

## Overview

**Creative North Star: "The Platform Board"**

The network reads like the dot-matrix departure board on a UK station platform. A black housing, divided by hairline frame seams, carries amber LED glyphs: the verdict is the board's top line, and lines and stations are ranked rows, worst first. The map is the board's lit platform diagram, a near-black basemap where only data is allowed to glow. Prose that explains, qualifies or attributes sits beside the glyphs in a calm, highly legible sans.

Density is that of a working board: one 8px module sets row height, gutters and seams, and every row is a full-width 48px tap target. The board is flat. Depth comes only from light, through LED bloom, the glow on severe lines and the white selection corridor, plus the one floating detail panel. Motion is mechanical and stepped, like a board refreshing, never springy or decorative.

Two signals live on this board and never share an encoding. Line status is amber, because that is "TfL says". Station crowding runs on a red-to-blue deviation scale measured against a typical day. Selection belongs to neither signal: it is the board's own inversion.

**Key Characteristics:**
- Black housing (`housing`, `panel`) with 1px seams; no cards, no rounded panels.
- Amber Doto LED glyphs for board copy and line status; Atkinson Hyperlegible Next for all prose.
- A red/grey/blue crowding scale, with a hollow ring for "no live data".
- One selection treatment: an amber field with black glyphs on the board, a white corridor on the map.
- The map is the lit network only: a black ground, a faint Thames, dim area names, and LED-pixel stations.
- Tabular figures everywhere; LED type only at five whole-rem steps.
- Changed rows re-scan in place and hold an amber pip until they have been seen.

## Colors

A near-black, slightly cool housing lit by one warm amber and one red/blue diverging data scale.

### Primary
- **Platform Amber** (`led`): the LED glyph colour. It carries board copy (titles, ranks, row names, the verdict, the clock), disrupted-line status on the board and the map (minor and severe strokes and line labels), feed-health alerts (the stale freshness readout, the notice icon) and interactive chrome (focus ring, caret, link hover). It is also the selection ground.
- **Dimmed Amber** (`led-dim`): unlit-feeling board copy. Used for ranks, the masthead name, readout terms, good-service status values, the summary row, link underlines, and the border of the notice and the detail panel.
- **LED Bloom** (`led-bloom`): the soft glow (`text-shadow: 0 0 6px`) behind lit glyphs, the changed-row pip and the severe stroke in the key. It is glow, never a shadow.

### Secondary: crowding deviation scale
- **Signal Red** (`band-much-busier`) and **Pale Rose** (`band-busier`): busier than a typical day at this time.
- **Platform Grey** (`band-normal`): normal for the time.
- **Pale Sky** (`band-quieter`) and **Signal Blue** (`band-much-quieter`): quieter than usual.
- **Dead Pixel Grey** (`band-unknown`): no live data. It is drawn only as a hollow ring (a 2px inset stroke on the board, a 1.25px stroke on the map, at the base 2.5px pixel size), never as a filled dot.

### Tertiary: selection
- **Corridor White** (`corridor`): the map's selection light. For a line it is a 3px-to-5px stroke (zoom 10 to 14) over a blurred glow at 0.28 opacity, while every other line and its labels dim to 30% and stations off the line dim to 25%. For a station it is a 2.5px ring set 5px outside the dot, plus a 13px label. It also becomes the focus-ring colour on a selected (amber) row.
- **Select Ink** (`select-ink`): black glyphs on the amber selection ground.

### Neutral
- **Housing Black** (`housing`): page ground, basemap background, the verdict band, input and chip fills, and the casing under map lines.
- **Panel** (`panel`): the masthead, board heads, map key and detail panel.
- **Panel Raised** (`panel-raised`): row hover and the map controls.
- **Seam** (`seam`) and **Seam Strong** (`seam-strong`): 1px frame seams between rows and sections; control and input borders, and the dashed rule above the verdict readout.
- **Warm Ink** (`ink`), **Ink 2** (`ink-2`), **Ink 3** (`ink-3`): prose, then metadata, then placeholders and unknown values. They are warm off-whites, like paper notices on the housing.
- **Unlit Line** (`line-good`): good-service and unknown-status lines on the map and in the key. They stay dark so that disrupted lines lead.

### Map surfaces
These live in `MAP_COLORS` in `lib/colors.ts`, the single source for every hex MapLibre paints.
- **Thames Ink** (`map-water`): the river and other water, a faint ink ribbon that is just visible against the housing.
- **Area Name** (`map-place`) and **Minor Area Name** (`map-place-minor`): dim orientation labels for localities and neighbourhoods. They are decorative, so they are kept well below the data.
- **Station Name** (`map-station-label`): station labels once the map is zoomed in (from zoom 12.5).

### Named Rules
**The Two Signals Rule.** Amber means line status ("TfL says"); red-to-blue means crowding against a typical day. Amber never colours a crowding value, and the band colours never colour line status. `lib/colors.ts` leaves amber out of `BAND_COLORS` on purpose.

**The Kept-in-Sync Rule.** The band and line colours exist twice: as `--band-*` and `--line-good` in `tokens.css`, and as `BAND_COLORS` and `STATUS_COLORS` in `lib/colors.ts` (for MapLibre paint). Change them together. Map surfaces come only from `MAP_COLORS`; MapView never hardcodes a hex.

**The One Selection Rule.** A picked line or station gets exactly two marks: the amber inversion on its board row (and the detail head), and the Corridor White line or ring on the map. Nothing else signals selection.

**The Honest Ring Rule.** No data is a hollow ring in Dead Pixel Grey, labelled "No data". It never borrows Platform Grey, which means "normal".

## Typography

**Display Font:** Doto (with ui-monospace, monospace), self-hosted variable 600–900
**Body Font:** Atkinson Hyperlegible Next (with system-ui, -apple-system, Segoe UI, sans-serif), self-hosted variable 400–700

**Character:** A dot-matrix bitmap face that reads as the board itself, paired with a sans built for legibility at small sizes. Doto is always uppercase, at 800 for rows and 900 for headline glyphs, with 0.04em tracking (0.02em on the verdict). Both faces are preloaded so the verdict never paints in a system mono.

### Hierarchy
- **LED Display** (900, `--led-lg` 2.5rem, rising to `--led-xl` 3.5rem from 640px to 1023px; 1.05 line-height, balanced wrap): the verdict, plus the large crowding figure in the detail panel (in its band colour) and the error title.
- **LED Title** (900, `--led-md` 1.5rem, 1.15): the detail panel's station or line name, on the amber head.
- **LED Row** (800, `--led-sm` 1.25rem, 1.15, two-line clamp on names): board titles, row names and values, the clock, and line status in the detail panel.
- **LED Small** (800, `--led-xs` 1rem): ranks, the masthead name (0.08em tracking), the verdict readout, and line status on narrow phones.
- **Body Large** (400, 1.125rem): the verdict headline (46ch max) and the detail phrase.
- **Body** (400, 1rem, 1.5 line-height): detail prose (60ch max), search input.
- **Body Small** (400, 0.875rem): tickers, notices, facts, chips, segmented buttons, footer "about" text (62ch max).
- **Label** (400, 0.8125rem): board meta, freshness, the map key, board controls and attribution. The map key uses 600 for its group labels.

### Named Rules
**The Whole Steps Rule.** LED type only ever sits on the five `--led-*` steps (1, 1.25, 1.5, 2.5, 3.5rem), like a bitmap specimen. Never set Doto with a clamp, a fluid value or an off-step size.

**The Tabular Board Rule.** `font-variant-numeric: tabular-nums` is set on the body and on `.led`, so figures stay column-aligned on every row.

**The Glyphs Are Not Prose Rule.** Doto carries short board copy: names, statuses, figures and the verdict. Any sentence a visitor has to read (headline, disruption text, explanations, notices) is set in Atkinson Hyperlegible Next.

Map labels are set in Noto Sans Medium because MapLibre's glyph server provides it. They are the one place a third face appears. Line and station names are 12px (13px for the selected station). Area names are uppercase with 0.14em tracking, at 10px rising to 12px for localities and 10px for neighbourhoods, so they read as faint stencilled orientation rather than as data.

## Layout

**Phone (default):** a single column, in this order: masthead, verdict, map, lines board, stations board, footer. The map is bounded at `clamp(300px, 46dvh, 560px)` so that the LINES board head and its first row land in the first viewport.

**Desktop (1024px and up):** two columns, `minmax(0, 1fr)` and a 460px `--column`. The map holds the left edge, sticky and full height (`100dvh`). The board stacks on the right as a totem, separated from the map by a 1px seam.

**The board module:** everything steps in 8px (`--unit`), with half steps at 4px and 12px for internal gaps. Rows, board heads, the masthead and the "show all" control are all at least 48px (`--row`). Rows use a three-column grid: a 3.25rem rank column, a flexible name column and an auto-width value column, with 12px gaps and 8px/16px padding. Below 560px, line rows stack their status under the name. The ticker's text window starts at the name column so it never crosses the rank.

Below 560px the map key collapses to one continuous busier-to-quieter scale and a single row for lines.

### Named Rules
**The One Module Rule.** Row height, gutters, seams and glyph sizes all derive from the 8px module. A new board element must be at least 48px tall if it is tappable, and padded at 8px/16px.

## Elevation & Depth

The board is flat, and depth is carried by light rather than lift. Sections meet at 1px seams on the same plane. Glyphs glow (LED bloom), severe lines glow (a soft amber line of 8px to 14px, blurred by 6px to 10px), the "much" crowding bands bloom and the selected corridor glows. Real shadows appear only on things that float over the map.

### Shadow Vocabulary
- **Sheet** (`box-shadow: 0 -12px 32px rgb(0 0 0 / 0.55)`): the phone's detail sheet, rising from the bottom edge.
- **Card** (`box-shadow: 0 16px 40px rgb(0 0 0 / 0.6)`): the desktop detail card, floating over the top-left of the map.
- **Map control** (`box-shadow: 0 2px 8px rgb(0 0 0 / 0.4)`): the re-dressed MapLibre zoom group.
- **LED bloom** (`text-shadow: 0 0 6px var(--led-bloom)`): lit amber glyphs. It is removed on band-coloured figures and on selected rows.

### Named Rules
**The Light Not Lift Rule.** Emphasis on the board comes from lighting glyphs or strokes, never from raising a surface. Only the detail panel floats.

## Shapes

The form is the board's enclosure: square, framed and segmented. Corners are nearly square (`--radius` 2px) on controls, chips, inputs, notices and the segmented group. Board sections, rows and panels have no radius at all. Circles are reserved for data and status marks: station dots (10px in the key, 14px large; LED pixels on the map), the hollow no-data ring and the 6px changed pip. Rules are 1px solid seams, with one dashed seam above the verdict readout. In the key, minor disruption is a 3px amber dash and severe is a 4px solid amber stroke with bloom, matching the map.

Icons come from one drawn SVG set on a 16px grid, with 1.5px strokes, round caps, `currentColor`, and decorative by default.

## Components

### Board Rows
*The unit of the system: a ranked line on the platform board.*
- **Shape:** full-width and square, at least 48px tall, separated by 1px seams.
- **Default:** a transparent ground, with the rank in Dimmed Amber LED Small, the name in amber LED Row, and the value in LED Row. Station values are tinted with their band colour and lead with a band dot or the no-data ring, with no bloom. Good-service line status is dimmed.
- **Hover:** Panel Raised ground (a 150ms ease-out transition).
- **Selected (`aria-pressed`):** the board's inversion. The ground turns amber, every glyph turns Select Ink with no bloom, the no-data ring turns black, and the focus ring switches to Corridor White.
- **Changed since last refresh:** the name and value re-scan with a column wipe (480ms, `steps(12)`, using a `clip-path` inset). A 6px amber pip with bloom sits at the left edge until the row scrolls into view.
- **Summary row:** a chevron in the rank column, with the name and value in Dimmed Amber. It expands to show the remaining lines.

### Ticker ("calling at")
Disruption text in Body Small Ink 2 runs beneath its row. It scrolls at 60px/s only when it overflows, inside a window masked at both edges. It pauses on hover or focus, or via the board's pause control (a stored preference), and becomes static wrapped text under reduced motion.

### Verdict
The board's top line: an LED Display verdict on Housing Black, a Body Large headline that names the baseline ("Versus a typical Tuesday at this time"), and a dashed-rule LED Small readout. In the readout, the Network value takes its band colour and the Lines value stays amber.

### Masthead
A 48px Panel strip holding the name in Dimmed Amber LED Small, the mandatory "Unofficial" tag in Label Ink 3, a ticking amber LED Row clock, and a Label freshness line that turns amber when the feed is stale.

### Detail Panel
- **Phone:** a fixed bottom sheet (at most `min(52dvh, 460px)`) with an amber top border and the Sheet shadow. It enters from 24px below (260ms ease-out).
- **Desktop:** a card up to 400px wide, placed 16px inside the map's top-left corner, with a 1px Dimmed Amber border and the Card shadow. It enters from 8px above.
- **Head:** sticky, in the selection inversion (an amber ground with the name in black LED Title) and a 40px close button.
- **Body:** the large band-coloured figure with its phrase, a facts list (Ink 2 terms), prose, and chips for "Lines here".

### Chips, Board Controls and Segmented Group
- **Chip:** 36px tall, with a Housing ground, a Seam Strong border, a 2px radius and Body Small ink. Hovering turns the border Dimmed Amber. A chip for a disrupted line has amber text and a Dimmed Amber border.
- **Board control:** 32px tall, with a Housing ground, a Seam Strong border and Label Ink 2 text with an icon. When pressed, the text turns amber and the border Dimmed Amber.
- **Segmented group (Busiest / Quietest):** 40px buttons inside a single bordered group with 1px internal seams. The pressed segment takes a Panel Raised ground, amber 700 text and a 2px amber inset underline (`box-shadow: inset 0 -2px 0`). A pressed mode toggle is lit, never inverted; inversion is reserved for selection.

### Search Input
40px tall, with a Housing ground, a Seam Strong border, a 2px radius, Body text and a 16px search icon in Ink 3. On focus the border turns amber, with no outline offset. The native clear button is redrawn as an Ink 2 cross.

### Notice
A board notice for a stale feed, the overnight pause or an unreachable feed: a 1px Dimmed Amber border, a 6% amber tint, an amber alert icon and Body Small ink. Its copy is always a plain sentence.

### Map
*The lit network only: the board's own platform diagram, not a street map.*
- **Ground:** a hand-built style over the self-hosted pmtiles. It has a Housing Black background, Thames Ink water, and two dim uppercase layers of area names (localities always, neighbourhoods from zoom 12.5) with a Housing halo. There are no streets, parks, buildings, POIs or icon sprite.
- **Lines:** every line sits on a Housing casing (4px to 7px). Good service is Unlit Line at 1.25px to 2.5px. Minor disruption is an amber dash (2, 1.5) at 2px to 3.5px. Severe is solid amber at 2.5px to 4.5px over a soft amber glow. All widths interpolate linearly from zoom 10 to zoom 14.
- **Line names:** amber, 12px, centred once along each minor or severe line, drawn above the station dots so a disrupted line can be found without tapping.
- **Stations as LED pixels:** normal and no-data stations are fixed 2.5px pixels. Only busier and quieter stations grow, to 3.5px plus up to 8px in proportion to how far they deviate (capped at 100% deviation). Much-busier and much-quieter stations also get a soft bloom beneath them, 2.2 times the dot radius, fully blurred, at 0.35 opacity. All radii scale from 0.85x at zoom 10 to 1.5x at zoom 14. Filled dots have a 1px Housing outline; no-data stations are hollow Dead Pixel Grey rings.
- **Layer order:** basemap, network, station dots and blooms, the selected-station ring, line names, area names, then station names. Area names sit above the network, so lines never slice through them and they keep placement priority.
- **Focus:** selecting a line applies the corridor treatment described under Colors; nothing else on the map changes.

## Do's and Don'ts

### Do:
- **Do** keep amber for board copy, line status and feed alerts, and keep crowding on the `--band-*` scale.
- **Do** draw no-data as a hollow Dead Pixel Grey ring and label it "No data".
- **Do** express selection only as the amber row or head inversion on the board and the Corridor White line or ring on the map.
- **Do** keep the map to the lit network: housing ground, Thames Ink water, dim area names, lines, and stations as LED pixels.
- **Do** set Doto only at the five `--led-*` steps, uppercase, and set every sentence in Atkinson Hyperlegible Next.
- **Do** build rows and heads on the 8px module, at least 48px tall, separated by 1px seams.
- **Do** give every band colour a second channel: a signed percentage, a phrase or a visually hidden description.
- **Do** keep the "Unofficial" notice and the attribution in every layout.

### Don't:
- **Don't** use amber, or a white glow, to show crowding, and don't use band colours for line status.
- **Don't** use official TfL line colours, the roundel or Johnston to identify lines. Identify lines by their name labels and by selection.
- **Don't** fill a no-data station with Platform Grey; grey means "normal".
- **Don't** set Doto at fluid or off-step sizes, or use it for running sentences.
- **Don't** raise board sections with shadows or rounded cards; only the detail panel floats.
- **Don't** invent a second selection treatment (outlines, tints, underlines) for picked rows or map features.
- **Don't** add streets, parks, buildings, POIs or icon sprites back to the basemap, and don't hardcode map hexes outside `MAP_COLORS`.
