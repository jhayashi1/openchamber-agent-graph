import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { expect, test } from "bun:test";
import { ACTIVITY_KINDS } from "./activity";

if (!GlobalRegistrator.isRegistered) GlobalRegistrator.register();
const { KIND_ICON_PATHS, kindIconGroup, kindIconSvg } = await import("./icons");

test("every activity kind has an icon with at least one path", () => {
  for (const kind of ACTIVITY_KINDS) expect(KIND_ICON_PATHS[kind].length).toBeGreaterThan(0);
  expect(Object.keys(KIND_ICON_PATHS).sort()).toEqual([...ACTIVITY_KINDS].sort());
});

test("icon helpers draw in the current colour", () => {
  const svg = kindIconSvg("network", 12);
  expect(svg.getAttribute("stroke")).toBe("currentColor");
  const group = kindIconGroup("network", 14, 5, 6);
  expect(group.getAttribute("transform")).toContain("translate(5 6)");
  expect(group.querySelectorAll("path")).toHaveLength(KIND_ICON_PATHS.network.length);
});
