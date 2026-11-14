type Palette = { label: string; hueStart: number; hueSpan: number; saturation: number; lightness: number; lightnessSpread: number };

export const PALETTES = {
  vivid: { label: "Vivid", hueStart: 0, hueSpan: 360, saturation: 65, lightness: 55, lightnessSpread: 1 },
  pastel: { label: "Pastel", hueStart: 0, hueSpan: 360, saturation: 70, lightness: 66, lightnessSpread: 1 },
  muted: { label: "Muted", hueStart: 0, hueSpan: 360, saturation: 30, lightness: 52, lightnessSpread: 1 },
  neon: { label: "Neon", hueStart: 0, hueSpan: 360, saturation: 100, lightness: 60, lightnessSpread: 1 },
  ocean: { label: "Ocean", hueStart: 165, hueSpan: 75, saturation: 65, lightness: 55, lightnessSpread: 1 },
  sunset: { label: "Sunset", hueStart: 345, hueSpan: 60, saturation: 80, lightness: 58, lightnessSpread: 1 },
  forest: { label: "Forest", hueStart: 25, hueSpan: 125, saturation: 45, lightness: 42, lightnessSpread: 1 },
  mono: { label: "Monochrome", hueStart: 215, hueSpan: 1, saturation: 18, lightness: 40, lightnessSpread: 30 },
} satisfies Record<string, Palette>;

export type PaletteId = keyof typeof PALETTES;

export const PALETTE_IDS = Object.keys(PALETTES).filter((id): id is PaletteId => id in PALETTES);

export function isPaletteId(value: unknown): value is PaletteId {
  return typeof value === "string" && Object.hasOwn(PALETTES, value);
}

export function nodeColor(id: string, palette: PaletteId = "vivid"): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  const { hueStart, hueSpan, saturation, lightness, lightnessSpread } = PALETTES[palette];
  const hue = (hueStart + (hash % hueSpan)) % 360;
  return `hsl(${hue} ${saturation}% ${lightness + ((hash >>> 9) % lightnessSpread)}%)`;
}
