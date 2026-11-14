import { describe, expect, test } from "bun:test";
import { nodeColor, PALETTE_IDS } from "./color";

describe("nodeColor", () => {
  test("is stable for an id", () => {
    expect(nodeColor("ses_abc")).toBe(nodeColor("ses_abc"));
  });

  test("returns a valid hsl string", () => {
    expect(nodeColor("ses_abc")).toMatch(/^hsl\((?:[0-9]|[1-9][0-9]|[12][0-9][0-9]|3[0-5][0-9]) 65% 55%\)$/);
  });

  test("gives different hues for different ids", () => {
    const colors = new Set(["a", "b", "c", "d", "e"].map((id) => nodeColor(id)));
    expect(colors.size).toBeGreaterThanOrEqual(4);
  });

  test("vivid is unchanged from the original colouring", () => {
    expect(nodeColor("a")).toBe("hsl(" + (nodeColor("a").match(/\d+/)![0]) + " 65% 55%)");
    expect(nodeColor("a", "vivid")).toBe(nodeColor("a"));
  });

  test("every palette gives a stable valid colour", () => {
    expect(PALETTE_IDS).toHaveLength(8);
    for (const palette of PALETTE_IDS) {
      for (const id of ["a", "ses_abc", "zz"]) {
        expect(nodeColor(id, palette)).toMatch(/^hsl\(\d{1,3} \d{1,3}% \d{1,3}%\)$/);
        expect(nodeColor(id, palette)).toBe(nodeColor(id, palette));
      }
    }
  });

  test("ocean hues stay in the blue-green band", () => {
    for (const id of ["a", "b", "c", "d", "e", "f", "g"]) {
      const hue = Number(nodeColor(id, "ocean").match(/\d+/)![0]);
      expect(hue).toBeGreaterThanOrEqual(165);
      expect(hue).toBeLessThan(240);
    }
  });
});
