/**
 * Browser-safe client for the voice routes. `speak` hides the one contract quirk (audio on
 * success, JSON on failure) so callers always get a single result shape.
 */
import type { SpeakError, SpeakRequest, VoicesResponse } from "@/types/voice";

export type SpeakResult = { ok: true; audio: Blob } | { ok: false; error: SpeakError };

export async function getVoices(signal?: AbortSignal): Promise<VoicesResponse> {
  try {
    return (await (await fetch("/api/voice/voices", { signal })).json()) as VoicesResponse;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    return { ok: false, error: networkError() };
  }
}

export async function speak(request: SpeakRequest, signal?: AbortSignal): Promise<SpeakResult> {
  let response: Response;
  try {
    response = await fetch("/api/voice/speak", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
      signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    return { ok: false, error: networkError() };
  }

  if (response.ok && response.headers.get("content-type")?.startsWith("audio/")) {
    return { ok: true, audio: await response.blob() };
  }
  try {
    const body = (await response.json()) as { error?: SpeakError };
    if (body.error) return { ok: false, error: body.error };
  } catch {
    // Fall through to a generic error for non-JSON failures.
  }
  return {
    ok: false,
    error: { code: "INTERNAL_ERROR", message: `Voice request failed (HTTP ${response.status}).` },
  };
}

function networkError(): SpeakError {
  return { code: "NETWORK_ERROR", message: "Could not reach the Fluid Research server." };
}
