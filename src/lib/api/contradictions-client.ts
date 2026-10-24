import type { ContradictionRequest, ContradictionResponse } from "@/types/contradictions";

export async function requestContradictions(
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
      error: { code: "NETWORK_ERROR", message: "Could not reach the KnowBefore server." },
    };
  }
}
