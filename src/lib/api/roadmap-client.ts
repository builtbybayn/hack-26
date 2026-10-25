import { track } from "@/lib/agent-activity";
import type { RoadmapRequest, RoadmapResponse } from "@/types/roadmap";

export function requestRoadmap(
  input: RoadmapRequest,
  signal?: AbortSignal,
): Promise<RoadmapResponse> {
  return track(
    "thinking",
    input.previous ? "Reshaping the roadmap" : "Planning your research roadmap",
    () => fetchRoadmap(input, signal),
  );
}

async function fetchRoadmap(input: RoadmapRequest, signal?: AbortSignal): Promise<RoadmapResponse> {
  try {
    const response = await fetch("/api/roadmap", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      signal,
    });
    return (await response.json()) as RoadmapResponse;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    return {
      ok: false,
      error: { code: "NETWORK_ERROR", message: "Could not reach the Fluid Research server." },
    };
  }
}
