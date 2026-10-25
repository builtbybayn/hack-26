import type { BriefCheckRequest, BriefCheckResponse } from "@/types/brief";

export async function checkBriefFinding(input: BriefCheckRequest): Promise<BriefCheckResponse> {
  try {
    const response = await fetch("/api/brief/check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    return (await response.json()) as BriefCheckResponse;
  } catch {
    return {
      ok: false,
      error: { code: "NETWORK_ERROR", message: "Could not reach the KnowBefore server." },
    };
  }
}
