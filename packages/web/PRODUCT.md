# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Londoners deciding whether or when to travel, mostly on a phone in a quick glance before leaving home or work: "is the network unusually bad right now, and is my line affected?" A secondary audience is the data-curious, who explore the map on a larger screen.

## Product Purpose

Pulse of London is a free, public, live map of London's rail network that answers one question: is it unusually bad right now, and where? Success is a confident answer within seconds of opening the page, without needing to read a table.

## Positioning

The signal is baseline-relative and bi-directional. A station is only "busier" if it is busier than a typical day at this time, not merely busy, so an empty platform at 03:00 reads as normal and a quiet rush hour reads as quieter. Journey planners and status boards show absolute state; this shows deviation from normal.

## Operating Context

- Data: TfL Unified API open data. Live crowding for ~270 tube stations, compared against TfL's typical 15-minute weekday bands, plus live line status for tube, Overground, Elizabeth line, DLR and tram.
- Freshness: the snapshot's `generatedAt` stays under a minute old; each station's crowding refreshes roughly every 9 minutes. The UI must say how fresh it is and degrade honestly when the feed is stale.
- Line status (good / minor / severe) and station crowding (much quieter → much busier) are two different signals and must not be confused.
- Some stations have no live crowding feed ("no live data"); non-tube lines have status but no crowding.

## Capabilities and Constraints

- Single page: network headline, map of lines and stations, details for a selected line or station, a full keyboard-accessible list equivalent of the map.
- Runs on Cloudflare Workers Free (SSR via React Router v7). The browser polls the public snapshot directly; there is no backend per-user state.
- Not a journey planner and not a replacement for TfL Go or Citymapper. No accounts, no PII, no login.
- Not real-time to the second; ~1–9 minute freshness matches the upstream data.

## Brand Commitments

- Working name "Pulse of London". It must read as clearly independent of TfL: no TfL roundel, typeface (Johnston), or official line-colour branding used to imply affiliation.
- The "Unofficial — not affiliated with or endorsed by Transport for London" notice and TfL / OS / OSM / Protomaps attribution are mandatory (TfL ToS §12).

## Evidence on Hand

- Live snapshot schema and real data (`@pulse/shared` `Snapshot`); bundled sample fixture at `app/fixtures/sample-snapshot.ts`.
- Line geometry at `public/data/geometry.geojson`; self-hosted Protomaps basemap on R2.
- No testimonials, usage numbers or press exist; do not invent any.

## Product Principles

1. Answer first: the verdict ("busier than usual for a Tuesday") leads; detail is one tap away.
2. Deviation, not volume: every visual encoding means "compared with a typical day at this time".
3. Honest about data: never fabricate a signal; unknown is shown as unknown, stale as stale.
4. The map is the product, and the list is its equal for anyone who can't use the map.

## Accessibility & Inclusion

WCAG 2.2 AA is a hard requirement. Colour is never the only carrier of meaning (bands need a second channel), the map has a complete keyboard and screen-reader equivalent, and focus is always visible.
