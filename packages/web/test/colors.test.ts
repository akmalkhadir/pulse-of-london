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
  it("busier is red, quieter is blue, unknown is neutral, and none of them is the LED amber", () => {
    expect(bandColor("much_busier")).toBe("#FF4D5E");
    expect(bandColor("busier")).toBe("#F0929B");
    expect(bandColor("quieter")).toBe("#86B9EA");
    expect(bandColor("much_quieter")).toBe("#3E9BFF");
    expect(bandColor("unknown")).toBe("#6B7079");
    for (const c of Object.values(BAND_COLORS)) expect(c).not.toBe(STATUS_COLORS.severe);
  });
});

describe("statusColor", () => {
  it("lights disrupted lines amber and keeps good service dim", () => {
    expect(statusColor("good")).toBe(STATUS_COLORS.good);
    expect(statusColor("good")).toBe("#454B54");
    expect(statusColor("minor")).toBe("#FFB020");
    expect(statusColor("severe")).toBe("#FFB020");
    expect(statusColor("unknown")).toBe("#454B54");
  });
});
