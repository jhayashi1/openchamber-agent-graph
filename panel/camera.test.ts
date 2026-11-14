import { describe, expect, test } from "bun:test";
import {
  DEFAULT_FIT_MAX_SCALE,
  ZOOM_LIMITS,
  boundsOf,
  fitCamera,
  panBy,
  screenToWorld,
  worldToScreen,
  zoomAt,
} from "./camera";

const viewport = { width: 400, height: 200 };

describe("boundsOf", () => {
  test("includes the radius", () => {
    expect(boundsOf([{ x: 0, y: 0 }, { x: 10, y: 20 }], 5)).toEqual({
      minX: -5,
      minY: -5,
      maxX: 15,
      maxY: 25,
    });
  });
});

describe("fitCamera", () => {
  const bounds = { minX: 100, minY: 50, maxX: 300, maxY: 150 };

  test("centres the bounds in the viewport", () => {
    const camera = fitCamera(bounds, viewport, 20, ZOOM_LIMITS);
    const centre = worldToScreen(camera, { x: 200, y: 100 });
    expect(centre.x).toBeCloseTo(200);
    expect(centre.y).toBeCloseTo(100);
  });

  test("respects padding", () => {
    const camera = fitCamera(bounds, viewport, 20, ZOOM_LIMITS);
    expect(camera.scale).toBeCloseTo(1.6);
    const corner = worldToScreen(camera, { x: 100, y: 50 });
    expect(corner.x).toBeGreaterThanOrEqual(20 - 1e-9);
    expect(corner.y).toBeGreaterThanOrEqual(20 - 1e-9);
  });

  test("respects limits", () => {
    expect(fitCamera(bounds, viewport, 20, { minScale: 0.1, maxScale: 1 }).scale).toBe(1);
    const huge = { minX: 0, minY: 0, maxX: 100000, maxY: 100000 };
    expect(fitCamera(huge, viewport, 20, ZOOM_LIMITS).scale).toBe(ZOOM_LIMITS.minScale);
  });

  test("single-point bounds use the default max scale", () => {
    const camera = fitCamera(boundsOf([{ x: 0, y: 0 }], 0), viewport, 20, ZOOM_LIMITS);
    expect(camera.scale).toBe(DEFAULT_FIT_MAX_SCALE);
    expect(worldToScreen(camera, { x: 0, y: 0 })).toEqual({ x: 200, y: 100 });
  });
});

describe("zoomAt", () => {
  const camera = { x: 30, y: -10, scale: 1 };

  test("keeps the anchor fixed", () => {
    const anchor = { x: 120, y: 80 };
    const zoomed = zoomAt(camera, anchor, 1.7, ZOOM_LIMITS);
    const before = screenToWorld(camera, anchor);
    const after = screenToWorld(zoomed, anchor);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
    expect(zoomed.scale).toBeCloseTo(1.7);
  });

  test("clamps scale", () => {
    expect(zoomAt(camera, { x: 0, y: 0 }, 100, ZOOM_LIMITS).scale).toBe(ZOOM_LIMITS.maxScale);
    expect(zoomAt(camera, { x: 0, y: 0 }, 0.001, ZOOM_LIMITS).scale).toBe(ZOOM_LIMITS.minScale);
  });
});

describe("panBy and conversions", () => {
  test("panBy moves the camera", () => {
    expect(panBy({ x: 1, y: 2, scale: 2 }, 10, -5)).toEqual({ x: 11, y: -3, scale: 2 });
  });

  test("screen and world round-trip", () => {
    const camera = { x: 13, y: -7, scale: 2.5 };
    const point = { x: 42, y: 17 };
    const back = screenToWorld(camera, worldToScreen(camera, point));
    expect(back.x).toBeCloseTo(point.x);
    expect(back.y).toBeCloseTo(point.y);
  });
});
