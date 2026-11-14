import type { ActivityKind } from "./activity";

const SVG_NS = "http://www.w3.org/2000/svg";

/** Stroke paths on a 24x24 grid, drawn with a 2px round stroke in currentColor. */
export const KIND_ICON_PATHS: Record<ActivityKind, readonly string[]> = {
  files: ["M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z", "M14 3v5h5", "M9 13h6", "M9 17h6"],
  shell: ["M4 17l6-6-6-6", "M12 19h8"],
  network: ["M3 12a9 9 0 1 0 18 0a9 9 0 1 0-18 0", "M3 12h18", "M12 3c2.5 2.5 3.5 5.5 3.5 9s-1 6.5-3.5 9c-2.5-2.5-3.5-5.5-3.5-9s1-6.5 3.5-9z"],
  mcp: ["M9 3v5", "M15 3v5", "M6 8h12v3a6 6 0 0 1-12 0z", "M12 17v4"],
  browser: ["M5 4h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z", "M3 9h18", "M6.5 6.5h.01", "M9.5 6.5h.01"],
  agents: ["M7 8h10a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2z", "M12 8V4", "M12 3.5h.01", "M9 13h.01", "M15 13h.01", "M9.5 16.5h5"],
  skills: ["M13 2L4 14h7l-1 8 9-12h-7z"],
  memory: ["M6 3h12v18l-6-4-6 4z"],
  user: ["M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"],
  other: ["M4 12a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0-3 0", "M10.5 12a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0-3 0", "M17 12a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0-3 0"],
};

function iconPaths(kind: ActivityKind): SVGPathElement[] {
  return KIND_ICON_PATHS[kind].map((d) => {
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", d);
    return path;
  });
}

function strokeStyle(element: SVGElement) {
  element.setAttribute("fill", "none");
  element.setAttribute("stroke", "currentColor");
  element.setAttribute("stroke-width", "2");
  element.setAttribute("stroke-linecap", "round");
  element.setAttribute("stroke-linejoin", "round");
}

/** A standalone <svg> icon for HTML parents (legend, feed). */
export function kindIconSvg(kind: ActivityKind, size: number): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("data-icon", kind);
  strokeStyle(svg);
  svg.append(...iconPaths(kind));
  return svg;
}

/** Centre of each icon's drawn bounds on the 24x24 grid; most icons are symmetric, a few are not. */
export const KIND_ICON_CENTER: Record<ActivityKind, readonly [number, number]> = {
  files: [12, 12],
  shell: [12, 12],
  network: [12, 12],
  mcp: [12, 12],
  browser: [12, 12],
  agents: [12, 11.25],
  skills: [11.5, 12],
  memory: [12, 12],
  user: [12.5, 12],
  other: [12, 12],
};

/** A <g> icon of the given size, optically centred on (x, y), for use inside another <svg>. */
export function kindIconGroup(kind: ActivityKind, size: number, x = 0, y = 0): SVGGElement {
  const group = document.createElementNS(SVG_NS, "g");
  const [cx, cy] = KIND_ICON_CENTER[kind];
  group.setAttribute("transform", `translate(${x} ${y}) scale(${size / 24}) translate(${-cx} ${-cy})`);
  group.setAttribute("data-icon", kind);
  strokeStyle(group);
  group.setAttribute("stroke-width", String(Math.max(2, 36 / size)));
  group.append(...iconPaths(kind));
  return group;
}
