import type { SynthesisRequest, SynthesisResponse } from "@/types/synthesis";

export async function requestSynthesis(input: SynthesisRequest): Promise<SynthesisResponse> {
  try {
    const response = await fetch("/api/synthesis", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    return (await response.json()) as SynthesisResponse;
  } catch {
    return {
      ok: false,
      error: { code: "NETWORK_ERROR", message: "Could not reach the KnowBefore server." },
    };
  }
}
