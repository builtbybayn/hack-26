import { track } from "@/lib/agent-activity";
import type { CitationReferencesRequest, CitationReferencesResponse } from "@/types/research";

export function requestCitationReferences(
  input: CitationReferencesRequest,
): Promise<CitationReferencesResponse> {
  return track("searching", "Finding citation links", () => fetchCitationReferences(input));
}

async function fetchCitationReferences(
  input: CitationReferencesRequest,
): Promise<CitationReferencesResponse> {
  try {
    const response = await fetch("/api/papers/citations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    return (await response.json()) as CitationReferencesResponse;
  } catch {
    return {
      ok: false,
      error: { code: "NETWORK_ERROR", message: "Could not reach the citation service." },
    };
  }
}
