import type { AnomalyBand, StatusLevel } from "@pulse/shared";

/**
 * Anomaly band → colour on the dark board housing (keep in sync with --band-* in tokens.css).
 * Red = busier than usual, blue = quieter; the "much" bands are the vivid ends.
 * Amber is deliberately absent: it belongs to line status ("TfL says").
 */
export const BAND_COLORS: Record<AnomalyBand, string> = {
  much_busier: "#FF4D5E",
  busier: "#F0929B",
  normal: "#8A9099",
  quieter: "#86B9EA",
  much_quieter: "#3E9BFF",
  unknown: "#6B7079", // drawn as a hollow ring — no live data
};

/** Line status → map stroke colour (--line-good / --led). Disrupted lines light up amber; good service stays dim. */
export const STATUS_COLORS: Record<StatusLevel, string> = {
  good: "#454B54",
  minor: "#FFB020",
  severe: "#FFB020",
  unknown: "#454B54",
};

/** The map's own surfaces, from the housing palette in tokens.css. */
export const MAP_COLORS = {
  housing: "#0b0c0e", // --housing: the map ground
  water: "#0c1824", // the Thames, a faint ink ribbon
  place: "#5d626a", // area names (decorative orientation)
  placeMinor: "#474b52",
  stationLabel: "#d8d2c6", // station names when zoomed in
  corridor: "#f5f1e6", // --corridor: the selected line / station ring
} as const;

export function bandColor(band: AnomalyBand): string {
  return BAND_COLORS[band];
}

export function statusColor(level: StatusLevel): string {
  return STATUS_COLORS[level];
}
