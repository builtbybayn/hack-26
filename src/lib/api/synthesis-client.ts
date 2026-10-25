import { track } from "@/lib/agent-activity";
import type {
  SynthesisCheckRequest,
  SynthesisCheckResponse,
  SynthesisRequest,
  SynthesisResponse,
} from "@/types/synthesis";

export function requestSynthesis(input: SynthesisRequest): Promise<SynthesisResponse> {
  return track("comparing", "Synthesizing the project's papers", () => fetchSynthesis(input));
}

async function fetchSynthesis(input: SynthesisRequest): Promise<SynthesisResponse> {
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
      error: { code: "NETWORK_ERROR", message: "Could not reach the Fluid Research server." },
    };
  }
}

export function requestSynthesisCheck(
  input: SynthesisCheckRequest,
): Promise<SynthesisCheckResponse> {
  return track("analyzing", "Checking synthesis evidence", () => fetchSynthesisCheck(input));
}

async function fetchSynthesisCheck(input: SynthesisCheckRequest): Promise<SynthesisCheckResponse> {
  try {
    const response = await fetch("/api/synthesis/check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    return (await response.json()) as SynthesisCheckResponse;
  } catch {
    return {
      ok: false,
      error: { code: "NETWORK_ERROR", message: "Could not reach the Fluid Research server." },
    };
  }
}
