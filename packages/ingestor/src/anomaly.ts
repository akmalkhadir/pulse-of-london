import {
  ANOMALY_THRESHOLDS,
  classifyAnomaly,
  type AnomalyBand,
  type LineSnapshot,
  type NetworkSummary,
  type NetworkVerdict,
  type StationSnapshot,
} from "@pulse/shared";
import { londonWeekday } from "./time";

export function crowdingAnomaly(
  live: number | null,
  typical: number | null,
): { anomaly: number | null; band: AnomalyBand } {
  if (live === null || typical === null || typical === 0) {
    return { anomaly: null, band: "unknown" };
  }
  const anomaly = live / typical;
  return { anomaly, band: classifyAnomaly(anomaly) };
}

export function median(values: (number | null)[]): number | null {
  const nums = values.filter((v): v is number => v !== null).sort((a, b) => a - b);
  if (nums.length === 0) return null;
  const mid = Math.floor(nums.length / 2);
  return nums.length % 2 === 0 ? (nums[mid - 1]! + nums[mid]!) / 2 : nums[mid]!;
}

export function aggregateLineCrowding(
  lineId: string,
  stations: StationSnapshot[],
): number | null {
  const ratios = stations
    .filter((s) => s.lines.includes(lineId))
    .map((s) => s.anomaly);
  return median(ratios);
}

export function networkScore(
  stations: StationSnapshot[],
  lines: LineSnapshot[],
  now: Date,
): NetworkSummary {
  const crowdingAnomalyValue = median(stations.map((s) => s.anomaly));
  const disrupted = lines.filter((l) => l.statusLevel === "minor" || l.statusLevel === "severe");
  const worstLines = lines
    .filter((l) => l.statusLevel === "severe")
    .map((l) => l.name)
    .slice(0, 3);

  let verdict: NetworkVerdict = "typical";
  if (crowdingAnomalyValue !== null) {
    if (crowdingAnomalyValue >= ANOMALY_THRESHOLDS.busier) verdict = "busier_than_usual";
    else if (crowdingAnomalyValue <= ANOMALY_THRESHOLDS.quieter) verdict = "quieter_than_usual";
  }

  return {
    crowdingAnomaly: crowdingAnomalyValue,
    disruptedLineCount: disrupted.length,
    verdict,
    worstLines,
    headline: buildHeadline(verdict, disrupted.length, worstLines, now),
  };
}

function buildHeadline(
  verdict: NetworkVerdict,
  disruptedCount: number,
  worstLines: string[],
  now: Date,
): string {
  const day = fullWeekday(londonWeekday(now));
  const crowd =
    verdict === "busier_than_usual"
      ? `Busier than usual for a ${day}`
      : verdict === "quieter_than_usual"
        ? `Quieter than usual for a ${day}`
        : `About as busy as a typical ${day}`;
  if (disruptedCount === 0) return `${crowd}, and every line has a good service.`;
  const worst = worstLines.length ? ` (worst: ${worstLines.join(", ")})` : "";
  const lineWord = disruptedCount === 1 ? "line" : "lines";
  return `${crowd}, with ${disruptedCount} ${lineWord} disrupted${worst}.`;
}

function fullWeekday(short: string): string {
  const map: Record<string, string> = {
    Mon: "Monday", Tue: "Tuesday", Wed: "Wednesday", Thu: "Thursday",
    Fri: "Friday", Sat: "Saturday", Sun: "Sunday",
  };
  return map[short] ?? short;
}
