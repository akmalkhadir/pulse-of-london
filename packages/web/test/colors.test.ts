import { describe, expect, it } from "vitest";
import { bandColor, statusColor, BAND_COLORS, STATUS_COLORS } from "../app/lib/colors";

describe("bandColor", () => {
  it("maps every anomaly band to a hex colour", () => {
    expect(bandColor("much_busier")).toBe(BAND_COLORS.much_busier);
    expect(bandColor("busier")).toBe(BAND_COLORS.busier);
    expect(bandColor("normal")).toBe(BAND_COLORS.normal);
    expect(bandColor("quieter")).toBe(BAND_COLORS.quieter);
    expect(bandColor("much_quieter")).toBe(BAND_COLORS.much_quieter);
    expect(bandColor("unknown")).toBe(BAND_COLORS.unknown);
  });
  it("busier is warm (Danger/Warning), quieter is cool (Primary), unknown is neutral", () => {
    expect(bandColor("much_busier")).toBe("#DC2626");
    expect(bandColor("busier")).toBe("#D97706");
    expect(bandColor("quieter")).toBe("#3B82F6");
    expect(bandColor("unknown")).toBe("#64748B");
  });
});

describe("statusColor", () => {
  it("maps status levels to Success/Warning/Danger/neutral", () => {
    expect(statusColor("good")).toBe(STATUS_COLORS.good);
    expect(statusColor("good")).toBe("#16A34A");
    expect(statusColor("minor")).toBe("#D97706");
    expect(statusColor("severe")).toBe("#DC2626");
    expect(statusColor("unknown")).toBe("#64748B");
  });
});
