import { describe, expect, it } from "vitest";
import { AGENT_STATES } from "@/lib/agent-activity";
import {
  advanceWeights,
  FLUID_FORMS,
  FLUID_STATES,
  formWeights,
  materialColor,
} from "./fluid-forms";

describe("fluid activity forms", () => {
  it("covers every live activity once and keeps the shader contract at nine forms", () => {
    expect([...FLUID_STATES].sort()).toEqual(Object.keys(AGENT_STATES).sort());
    expect(new Set(FLUID_STATES).size).toBe(9);
    for (const state of FLUID_STATES) {
      expect(FLUID_FORMS[state].name.length).toBeGreaterThan(0);
      expect(formWeights(state).filter((weight) => weight === 1)).toHaveLength(1);
    }
  });

  it("preserves a convex surface blend through repeated interrupted transitions", () => {
    let weights = formWeights("idle");
    for (const state of [...FLUID_STATES, ...FLUID_STATES.toReversed()]) {
      for (let frame = 0; frame < 12; frame++) {
        weights = advanceWeights(weights, state, 1 / 60);
        expect(weights.reduce((sum, weight) => sum + weight, 0)).toBeCloseTo(1, 12);
        expect(weights.every((weight) => weight >= 0 && weight <= 1)).toBe(true);
      }
    }
    expect(weights.every(Number.isFinite)).toBe(true);
  });

  it("is independent of frame rate and settles on the requested form", () => {
    const start = formWeights("idle");
    let at60 = start;
    let at30 = start;
    for (let i = 0; i < 60; i++) at60 = advanceWeights(at60, "thinking", 1 / 60);
    for (let i = 0; i < 30; i++) at30 = advanceWeights(at30, "thinking", 1 / 30);
    at60.forEach((weight, index) => expect(weight).toBeCloseTo(at30[index], 12));
    expect(at60[FLUID_STATES.indexOf("thinking")]).toBeGreaterThan(0.99);
    expect(advanceWeights(start, "error", 0)).toEqual(start);
    expect(advanceWeights(start, "error", -1)).toEqual(start);
  });

  it("reads resolved theme colors in both browser color formats", () => {
    expect(materialColor("rgb(127, 109, 242)")).toEqual([127 / 255, 109 / 255, 242 / 255]);
    expect(materialColor("color(srgb 0.5 0.4 0.9)")).toEqual([0.5, 0.4, 0.9]);
    expect(materialColor("rgba(127, 109, 242, 0.5)")).toEqual([127 / 255, 109 / 255, 242 / 255]);
  });
});
