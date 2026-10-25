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
  idle: { name: "Free flow", description: "A weightless volume, folding and flowing in place." },
  reading: { name: "Icosahedron", description: "Twenty soft facets held in liquid tension." },
  analyzing: { name: "Stellation", description: "A faceted core extending into geometric points." },
  searching: { name: "Torus", description: "An open ring with a slow circulating current." },
  comparing: { name: "Twin volumes", description: "Two fluid bodies joined by a yielding bridge." },
  thinking: { name: "Twisted ring", description: "A threefold loop turning through itself." },
  "preparing-voice": {
    name: "Cone",
    description: "A tapered volume gathering into a rounded tip.",
  },
  speaking: { name: "Spikes", description: "A radial field of points extending and relaxing." },
  error: { name: "Cube", description: "A quiet, softened solid holding its form." },
};

export function formWeights(state: AgentState): number[] {
  return FLUID_STATES.map((candidate) => (candidate === state ? 1 : 0));
}

/** Positive, normalized weights allow interrupted morphs to continue from the visible surface. */
export function advanceWeights(
  current: readonly number[],
  state: AgentState,
  seconds: number,
): number[] {
  const blend = 1 - Math.exp(-Math.max(0, seconds) * 5);
  return current.map(
    (weight, index) => weight + ((FLUID_STATES[index] === state ? 1 : 0) - weight) * blend,
  );
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
