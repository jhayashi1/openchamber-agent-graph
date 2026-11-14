import type { Point } from "./force";

export type Camera = { x: number; y: number; scale: number };
export type Bounds = { minX: number; minY: number; maxX: number; maxY: number };
export type ScaleLimits = { minScale: number; maxScale: number };

export const ZOOM_LIMITS: ScaleLimits = { minScale: 0.1, maxScale: 4 };
export const LABEL_MIN_SCALE = 0.9;
export const DEFAULT_FIT_MAX_SCALE = 1.5;

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

export function boundsOf(points: Iterable<Point>, radius: number): Bounds {
  const bounds = {
    minX: Infinity,
    minY: Infinity,
    maxX: -Infinity,
    maxY: -Infinity,
  };
  for (const point of points) {
    bounds.minX = Math.min(bounds.minX, point.x - radius);
    bounds.minY = Math.min(bounds.minY, point.y - radius);
    bounds.maxX = Math.max(bounds.maxX, point.x + radius);
    bounds.maxY = Math.max(bounds.maxY, point.y + radius);
  }
  return bounds;
}

export function fitCamera(
  bounds: Bounds,
  viewport: { width: number; height: number },
  padding: number,
  limits: ScaleLimits,
): Camera {
  const width = bounds.maxX - bounds.minX;
  const height = bounds.maxY - bounds.minY;
  const availableWidth = Math.max(viewport.width - padding * 2, 1);
  const availableHeight = Math.max(viewport.height - padding * 2, 1);
  const fitScale =
    width === 0 || height === 0
      ? DEFAULT_FIT_MAX_SCALE
      : Math.min(availableWidth / width, availableHeight / height);
  const scale = clamp(fitScale, limits.minScale, limits.maxScale);
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerY = (bounds.minY + bounds.maxY) / 2;
  return {
    scale,
    x: viewport.width / 2 - centerX * scale,
    y: viewport.height / 2 - centerY * scale,
  };
}

export function zoomAt(
  camera: Camera,
  screenPoint: Point,
  factor: number,
  limits: ScaleLimits,
): Camera {
  const scale = clamp(camera.scale * factor, limits.minScale, limits.maxScale);
  const world = screenToWorld(camera, screenPoint);
  return {
    scale,
    x: screenPoint.x - world.x * scale,
    y: screenPoint.y - world.y * scale,
  };
}

export function panBy(camera: Camera, dx: number, dy: number): Camera {
  return { ...camera, x: camera.x + dx, y: camera.y + dy };
}

export function screenToWorld(camera: Camera, point: Point): Point {
  return {
    x: (point.x - camera.x) / camera.scale,
    y: (point.y - camera.y) / camera.scale,
  };
}

export function worldToScreen(camera: Camera, point: Point): Point {
  return {
    x: point.x * camera.scale + camera.x,
    y: point.y * camera.scale + camera.y,
  };
}
