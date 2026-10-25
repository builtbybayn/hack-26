import type { AgentState } from "@/lib/agent-activity";

/** Order is the shader's uniform-array contract. Keep every existing activity represented. */
export const FLUID_STATES = [
  "idle",
  "reading",
  "analyzing",
  "searching",
  "comparing",
  "thinking",
  "preparing-voice",
  "speaking",
  "error",
] as const satisfies readonly AgentState[];

export const FLUID_FORMS: Record<AgentState, { name: string; description: string }> = {
  idle: {
    name: "Silk loop",
    description: "A threefold current folding through a continuous loop.",
  },
  reading: {
    name: "Liquid crystal",
    description: "Icosahedral symmetry softened by surface tension.",
  },
  analyzing: { name: "Stellation", description: "Rounded arms unfurling from a flowing core." },
  searching: { name: "Torus", description: "An open ring with a slow circulating current." },
  comparing: { name: "Twin volumes", description: "Two fluid bodies joined by a yielding bridge." },
  thinking: {
    name: "Silk loop",
    description: "A threefold current folding through a continuous loop.",
  },
  "preparing-voice": {
    name: "Liquid spire",
    description: "A tapered current rising into a softly bending tip.",
  },
  speaking: { name: "Bloom", description: "Twelve liquid points slowly opening and gathering." },
  error: { name: "Soft cube", description: "A quiet volume settling into rounded symmetry." },
};

export function formWeights(state: AgentState): number[] {
  // Idle shares the silk-loop field and motion already used for thinking.
  const form = state === "idle" ? "thinking" : state;
  return FLUID_STATES.map((candidate) => (candidate === form ? 1 : 0));
}

/** Positive, normalized weights allow interrupted morphs to continue from the visible surface. */
export function advanceWeights(
  current: readonly number[],
  state: AgentState,
  seconds: number,
): number[] {
  const blend = 1 - Math.exp(-Math.max(0, seconds) * 3.2);
  const target = formWeights(state);
  return current.map((weight, index) => weight + (target[index] - weight) * blend);
}

/** Parse the browser's resolved CSS color, rather than duplicating theme colors in the shader. */
export function materialColor(cssColor: string): [number, number, number] {
  const channels = cssColor.match(/[\d.]+/g)?.map(Number);
  if (!channels || channels.length < 3) return [0.5, 0.5, 0.5];
  const scale = cssColor.startsWith("color(srgb") ? 1 : 255;
  return channels.slice(0, 3).map((channel) => Math.max(0, Math.min(1, channel / scale))) as [
    number,
    number,
    number,
  ];
}
