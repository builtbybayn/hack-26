import { track } from "@/lib/agent-activity";
import type { BriefCheckRequest, BriefCheckResponse } from "@/types/brief";

export function checkBriefFinding(input: BriefCheckRequest): Promise<BriefCheckResponse> {
  return track("analyzing", "Checking brief evidence", () => fetchBriefCheck(input));
}

async function fetchBriefCheck(input: BriefCheckRequest): Promise<BriefCheckResponse> {
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
      error: { code: "NETWORK_ERROR", message: "Could not reach the Fluid Research server." },
    };
  }
}
