import { track } from "@/lib/agent-activity";
import type { ContradictionRequest, ContradictionResponse } from "@/types/contradictions";

export function requestContradictions(
  input: ContradictionRequest,
  signal?: AbortSignal,
): Promise<ContradictionResponse> {
  return track("comparing", `Comparing ${input.documents.length} papers`, () =>
    fetchContradictions(input, signal),
  );
}

async function fetchContradictions(
  input: ContradictionRequest,
  signal?: AbortSignal,
): Promise<ContradictionResponse> {
  try {
    const response = await fetch("/api/contradictions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      signal,
    });
    return (await response.json()) as ContradictionResponse;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    return {
      ok: false,
      error: { code: "NETWORK_ERROR", message: "Could not reach the Fluid Research server." },
    };
  }
}
