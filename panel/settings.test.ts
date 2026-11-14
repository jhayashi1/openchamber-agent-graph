import { describe, expect, test } from "bun:test";
import { autoPauseRange, DEFAULT_SETTINGS, normalise } from "./settings";

describe("normalise", () => {
  test("returns defaults for missing or bad input", () => {
    for (const raw of [undefined, null, 5, "x", []]) expect(normalise(raw)).toEqual(DEFAULT_SETTINGS);
  });

  test("clamps numbers and falls back per field", () => {
    const result = normalise({ beamLength: 1000, beamSeconds: -3, beamWidth: "wide", beamColor: "red", messageColor: "#ABCDEF" });
    expect(result.beamLength).toBe(96);
    expect(result.beamSeconds).toBe(0.5);
    expect(result.beamWidth).toBe(DEFAULT_SETTINGS.beamWidth);
    expect(result.beamColor).toBe("theme");
    expect(result.messageColor).toBe("#abcdef");
  });

  test("keeps pause max at or above pause min", () => {
    const result = normalise({ beamPauseMin: 6, beamPauseMax: 2 });
    expect(result.beamPauseMax).toBe(6);
  });

  test("defaults the pause to 5-10 s and clamps at 30 s", () => {
    expect(DEFAULT_SETTINGS).toMatchObject({ beamPauseMin: 5, beamPauseMax: 10 });
    expect(normalise({ beamPauseMin: 99, beamPauseMax: 99 })).toMatchObject({ beamPauseMin: 30, beamPauseMax: 30 });
  });

  test("migrates the old 1-2 s pause defaults only before version 2", () => {
    expect(normalise({ version: 1, beamPauseMin: 1, beamPauseMax: 2 })).toMatchObject({ beamPauseMin: 5, beamPauseMax: 10 });
    expect(normalise({ beamPauseMin: 1, beamPauseMax: 2 })).toMatchObject({ beamPauseMin: 5, beamPauseMax: 10 });
    expect(normalise({ version: 1, beamPauseMin: 3, beamPauseMax: 4 })).toMatchObject({ beamPauseMin: 3, beamPauseMax: 4 });
    expect(normalise({ version: 2, beamPauseMin: 1, beamPauseMax: 2 })).toMatchObject({ beamPauseMin: 1, beamPauseMax: 2 });
  });

  test("accepts booleans only", () => {
    expect(normalise({ beamGlow: false, pulseRunning: "no" })).toMatchObject({ beamGlow: false, pulseRunning: true });
  });

  test("clamps the force fields", () => {
    const result = normalise({ centerForce: 9, repelForce: -4, linkForce: "x", linkDistance: 1000 });
    expect(normalise({ hubPull: 9 }).hubPull).toBe(3);
    expect(normalise({ hubPull: "x" }).hubPull).toBe(DEFAULT_SETTINGS.hubPull);
    expect(result).toMatchObject({ centerForce: 0.5, repelForce: 0, linkForce: DEFAULT_SETTINGS.linkForce, linkDistance: 400 });
  });
});

test("nodePalette defaults to vivid and falls back for unknown values", () => {
  expect(normalise(undefined).nodePalette).toBe("vivid");
  expect(normalise({ nodePalette: "neon" }).nodePalette).toBe("neon");
  expect(normalise({ nodePalette: "bogus" }).nodePalette).toBe("vivid");
});

describe("beam switches", () => {
  test("default to on and keep saved values", () => {
    expect(DEFAULT_SETTINGS).toMatchObject({ beamsOn: true, autoPause: true });
    expect(normalise({ version: 2 })).toMatchObject({ beamsOn: true, autoPause: true });
    expect(normalise({ beamsOn: false, autoPause: false })).toMatchObject({ beamsOn: false, autoPause: false });
    expect(normalise({ beamsOn: "no", autoPause: 0 })).toMatchObject({ beamsOn: true, autoPause: true });
  });
});

describe("autoPauseRange", () => {
  test("is 2-5 s up to 2 nodes and 20-30 s from 20 nodes, linear between", () => {
    for (const count of [0, 1, 2]) expect(autoPauseRange(count)).toEqual({ min: 2, max: 5 });
    expect(autoPauseRange(11)).toEqual({ min: 11, max: 17.5 });
    for (const count of [20, 40]) expect(autoPauseRange(count)).toEqual({ min: 20, max: 30 });
  });
});

test("tool pulses default on and accept a boolean", () => {
  expect(normalise(undefined).toolPulses).toBe(true)
  expect(normalise({ toolPulses: false }).toolPulses).toBe(false)
  expect(normalise({ toolPulses: "no" }).toolPulses).toBe(true)
})
