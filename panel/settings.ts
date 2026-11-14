import { isPaletteId, type PaletteId } from "./color";
import { DEFAULT_FORCES } from "./force";

export const SETTINGS_KEY = "settings";
export const SETTINGS_VERSION = 2;

export type AgentGraphSettings = {
  nodePalette: PaletteId;
  beamsOn: boolean;
  beamColor: string;
  beamLength: number;
  beamSeconds: number;
  autoPause: boolean;
  beamPauseMin: number;
  beamPauseMax: number;
  beamWidth: number;
  beamGlow: boolean;
  messageColor: string;
  messageOpacity: number;
  pulseRunning: boolean;
  waitingGlow: boolean;
  recencyFade: boolean;
  toolPulses: boolean;
  centerForce: number;
  hubPull: number;
  repelForce: number;
  linkForce: number;
  linkDistance: number;
};

export const DEFAULT_SETTINGS: AgentGraphSettings = {
  nodePalette: "vivid",
  beamsOn: true,
  beamColor: "theme",
  beamLength: 24,
  beamSeconds: 2,
  autoPause: true,
  beamPauseMin: 5,
  beamPauseMax: 10,
  beamWidth: 2,
  beamGlow: true,
  messageColor: "theme",
  messageOpacity: 25,
  pulseRunning: true,
  waitingGlow: true,
  recencyFade: true,
  toolPulses: true,
  centerForce: DEFAULT_FORCES.center,
  hubPull: DEFAULT_FORCES.hubPull,
  repelForce: DEFAULT_FORCES.repel,
  linkForce: DEFAULT_FORCES.link,
  linkDistance: DEFAULT_FORCES.distance,
};

export const RANGES = {
  beamLength: { min: 8, max: 96, step: 2 },
  beamSeconds: { min: 0.5, max: 6, step: 0.1 },
  beamPauseMin: { min: 0, max: 30, step: 0.5 },
  beamPauseMax: { min: 0, max: 30, step: 0.5 },
  beamWidth: { min: 1, max: 5, step: 0.5 },
  messageOpacity: { min: 5, max: 100, step: 5 },
  centerForce: { min: 0, max: 0.5, step: 0.01 },
  hubPull: { min: 0, max: 3, step: 0.1 },
  repelForce: { min: 0, max: 1000, step: 10 },
  linkForce: { min: 0, max: 1, step: 0.05 },
  linkDistance: { min: 30, max: 400, step: 10 },
} as const;

type NumericKey = keyof typeof RANGES;

function record(raw: unknown): Record<string, unknown> {
  return typeof raw === "object" && raw !== null ? Object.fromEntries(Object.entries(raw)) : {};
}

function colour(value: unknown, fallback: string): string {
  if (value === "theme") return "theme";
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : fallback;
}

function toggle(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function number(value: unknown, key: NumericKey): number {
  const { min, max } = RANGES[key];
  if (typeof value !== "number" || !Number.isFinite(value)) return DEFAULT_SETTINGS[key];
  return Math.min(max, Math.max(min, value));
}

export function autoPauseRange(nodeCount: number): { min: number; max: number } {
  const t = Math.min(1, Math.max(0, (nodeCount - 2) / 18));
  return { min: 2 + 18 * t, max: 5 + 25 * t };
}

export function normalise(raw: unknown): AgentGraphSettings {
  const source = record(raw);
  const oldDefaultPause =
    !(typeof source.version === "number" && source.version >= 2) && source.beamPauseMin === 1 && source.beamPauseMax === 2;
  const beamPauseMin = oldDefaultPause ? DEFAULT_SETTINGS.beamPauseMin : number(source.beamPauseMin, "beamPauseMin");
  return {
    nodePalette: isPaletteId(source.nodePalette) ? source.nodePalette : DEFAULT_SETTINGS.nodePalette,
    beamsOn: toggle(source.beamsOn, DEFAULT_SETTINGS.beamsOn),
    beamColor: colour(source.beamColor, DEFAULT_SETTINGS.beamColor),
    beamLength: number(source.beamLength, "beamLength"),
    beamSeconds: number(source.beamSeconds, "beamSeconds"),
    autoPause: toggle(source.autoPause, DEFAULT_SETTINGS.autoPause),
    beamPauseMin,
    beamPauseMax: Math.max(beamPauseMin, oldDefaultPause ? DEFAULT_SETTINGS.beamPauseMax : number(source.beamPauseMax, "beamPauseMax")),
    beamWidth: number(source.beamWidth, "beamWidth"),
    beamGlow: toggle(source.beamGlow, DEFAULT_SETTINGS.beamGlow),
    messageColor: colour(source.messageColor, DEFAULT_SETTINGS.messageColor),
    messageOpacity: number(source.messageOpacity, "messageOpacity"),
    pulseRunning: toggle(source.pulseRunning, DEFAULT_SETTINGS.pulseRunning),
    waitingGlow: toggle(source.waitingGlow, DEFAULT_SETTINGS.waitingGlow),
    recencyFade: toggle(source.recencyFade, DEFAULT_SETTINGS.recencyFade),
    toolPulses: toggle(source.toolPulses, DEFAULT_SETTINGS.toolPulses),
    centerForce: number(source.centerForce, "centerForce"),
    hubPull: number(source.hubPull, "hubPull"),
    repelForce: number(source.repelForce, "repelForce"),
    linkForce: number(source.linkForce, "linkForce"),
    linkDistance: number(source.linkDistance, "linkDistance"),
  };
}

export function serialise(settings: AgentGraphSettings) {
  return { version: SETTINGS_VERSION, ...settings };
}
