import type { RecommendationsRequest, RecommendationsResponse } from "@/types/research";

export async function requestRecommendations(
  input: RecommendationsRequest,
  signal?: AbortSignal,
): Promise<RecommendationsResponse> {
  try {
    const response = await fetch("/api/recommendations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      signal,
    });
    return (await response.json()) as RecommendationsResponse;
  } catch (error) {
    if (signal?.aborted) throw error;
    return {
      ok: false,
      error: {
        code: "NETWORK_ERROR",
        message: "Could not reach the paper recommendations service.",
      },
    };
  }
}
