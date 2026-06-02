import type { Snapshot } from "@pulse/shared";

/** Representative snapshot for local dev + tests until the live pipeline is wired. */
export const sampleSnapshot: Snapshot = {
  schemaVersion: 1,
  generatedAt: "2026-05-30T17:10:00.000Z",
  freshness: { statusAgeSec: 35, crowdingAgeSec: 130 },
  network: {
    crowdingAnomaly: 1.22,
    disruptedLineCount: 2,
    verdict: "busier_than_usual",
    headline: "Busier than usual for a Saturday, with 2 lines disrupted (worst: Central).",
    worstLines: ["Central"],
  },
  lines: [
    { id: "victoria", name: "Victoria", mode: "tube", statusSeverity: 10, statusDescription: "Good Service", statusLevel: "good", disruptions: [], crowdingAnomaly: 1.31 },
    { id: "central", name: "Central", mode: "tube", statusSeverity: 6, statusDescription: "Severe Delays", statusLevel: "severe", disruptions: [{ category: "RealTime", description: "Severe delays due to a signal failure at Liverpool Street." }], crowdingAnomaly: 1.8 },
    { id: "circle", name: "Circle", mode: "tube", statusSeverity: 9, statusDescription: "Minor Delays", statusLevel: "minor", disruptions: [{ category: "RealTime", description: "Minor delays due to an earlier faulty train." }], crowdingAnomaly: 0.7 },
    { id: "elizabeth", name: "Elizabeth line", mode: "elizabeth-line", statusSeverity: 10, statusDescription: "Good Service", statusLevel: "good", disruptions: [], crowdingAnomaly: null },
  ],
  stations: [
    { naptan: "940GZZLUVIC", name: "Victoria", lat: 51.496, lon: -0.1437, lines: ["victoria", "circle"], live: 0.62, typical: 0.48, anomaly: 1.29, anomalyBand: "busier", dataAvailable: true },
    { naptan: "940GZZLUOXC", name: "Oxford Circus", lat: 51.515, lon: -0.1417, lines: ["victoria", "central"], live: 0.9, typical: 0.5, anomaly: 1.8, anomalyBand: "much_busier", dataAvailable: true },
    { naptan: "940GZZLULVT", name: "Liverpool Street", lat: 51.5178, lon: -0.0823, lines: ["central", "circle"], live: 0.3, typical: 0.55, anomaly: 0.55, anomalyBand: "much_quieter", dataAvailable: true },
    { naptan: "940GZZLUKSX", name: "King's Cross St. Pancras", lat: 51.5308, lon: -0.1238, lines: ["victoria", "circle"], live: null, typical: null, anomaly: null, anomalyBand: "unknown", dataAvailable: false },
  ],
};
