/**
 * Browser-safe client for `POST /api/ingest`. Frontend code calls this
 * instead of using `fetch` directly, so every caller gets the same
 * `IngestResponse` shape, including for network failures.
 */
import type { IngestResponse } from "@/types/ingestion";

export async function uploadDocument(
  file: File,
  options: { signal?: AbortSignal } = {},
): Promise<IngestResponse> {
  const body = new FormData();
  body.append("file", file);

  let response: Response;
  try {
    response = await fetch("/api/ingest", {
      method: "POST",
      body,
      signal: options.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    return {
      ok: false,
      error: {
        code: "NETWORK_ERROR",
        message: "Could not reach the server. Check your connection and try again.",
      },
    };
  }

  try {
    return (await response.json()) as IngestResponse;
  } catch {
    return {
      ok: false,
      error: {
        code: "INTERNAL_ERROR",
        message: `The server sent an unexpected response (HTTP ${response.status}).`,
      },
    };
  }
}
