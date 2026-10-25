import { track } from "@/lib/agent-activity";
import type {
  DeepDiveReport,
  RadarResponse,
  ResearchContext,
  ResearchFinding,
  ResearchScan,
} from "@/types/radar";

async function request<T>(
  url: string,
  body: unknown,
  signal?: AbortSignal,
): Promise<RadarResponse<T>> {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
    return (await response.json()) as RadarResponse<T>;
  } catch (error) {
    if (signal?.aborted) throw error;
    return {
      ok: false,
      error: { code: "NETWORK_ERROR", message: "Research Radar could not reach the server." },
    };
  }
}

export function requestRadarScan(context: ResearchContext, signal?: AbortSignal) {
  return track("searching", "Scanning recent research discussions", () =>
    request<ResearchScan>("/api/research/scan", { context, consent: true }, signal),
  );
}

export function requestRadarDeepDive(
  context: ResearchContext,
  finding: ResearchFinding,
  signal?: AbortSignal,
) {
  return track("analyzing", "Investigating a research finding", () =>
    request<DeepDiveReport>(
      "/api/research/deep-dive",
      {
        context,
        finding: {
          id: finding.id,
          projectId: finding.projectId,
          title: finding.title,
          claim: finding.claims[0].text,
          sourceUrl: finding.socialSources[0].url,
          publishedAt: finding.socialSources[0].publishedAt,
        },
        consent: true,
      },
      signal,
    ),
  );
}
