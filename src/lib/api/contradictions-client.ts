import type { ContradictionRequest, ContradictionResponse } from "@/types/contradictions";

export async function requestCriticalReview(
  input: ContradictionRequest,
): Promise<ContradictionResponse> {
  try {
    const response = await fetch("/api/contradictions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    return (await response.json()) as ContradictionResponse;
  } catch {
    return {
      ok: false,
      error: { code: "NETWORK_ERROR", message: "Could not reach the KnowBefore server." },
    };
  }
}
