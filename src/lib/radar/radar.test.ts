import { afterEach, describe, expect, it, vi } from "vitest";
import { activeScan, RADAR_WINDOW_MS, verifiedXSource } from "./recency";
import { discoverX, parseXDiscovery } from "./x-search";
import { rankCandidates, scanRadar } from "./scan";
import type { ResearchContext, ResearchScan } from "@/types/radar";

const now = new Date("2026-10-25T12:00:00.000Z");
const urlAt = (time: number) =>
  `https://x.com/test/status/${((BigInt(time) - BigInt("1288834974657")) << BigInt(22)).toString()}`;
const context: ResearchContext = {
  projectId: "project-1",
  projectTitle: "Prerequisite knowledge graphs",
  projectSummary: "Extract prerequisite graphs from research papers",
  researchGoals: ["Improve learning paths"],
  keyConcepts: ["knowledge graph"],
  researchQuestions: [],
  knownChallenges: [],
  constraints: [],
  sourceDocumentIds: [],
};
const candidate = (url: string) => ({
  url,
  title: "Prerequisite knowledge graph extraction",
  summary: "Graph extraction improves learning paths",
  claim: "Prerequisite knowledge graphs improve learning paths",
  kind: "empirical" as const,
  conditions: "for students",
});
const response = (urls: string[]) => ({
  output: [
    {
      type: "message",
      content: [{ type: "output_text", text: JSON.stringify({ candidates: urls.map(candidate) }) }],
    },
  ],
  citations: urls,
  usage: { server_side_tool_usage_details: { x_search_calls: 1, x_posts_fetched: urls.length } },
});
const previousXaiKey = process.env.XAI_API_KEY;

describe("Research Radar source validation", () => {
  afterEach(() => {
    if (previousXaiKey === undefined) delete process.env.XAI_API_KEY;
    else process.env.XAI_API_KEY = previousXaiKey;
    vi.unstubAllGlobals();
  });
  it("requests bounded X Search with calendar dates and a structured response", async () => {
    process.env.XAI_API_KEY = "fixture-key";
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(response([]))));
    vi.stubGlobal("fetch", fetchMock);
    await expect(discoverX(context, now)).resolves.toMatchObject({ candidates: [] });
    const [url, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body);
    expect(url).toBe("https://api.x.ai/v1/responses");
    expect(body.tools[0]).toMatchObject({
      type: "x_search",
      from_date: "2026-10-18",
      to_date: "2026-10-26",
    });
    expect(body.text.format).toMatchObject({ type: "json_schema", strict: true });
    expect(body.max_tool_calls).toBe(2);
  });
  it("accepts both UTC window boundaries and rejects older, future, malformed, and missing URLs", () => {
    expect(verifiedXSource(urlAt(now.getTime() - RADAR_WINDOW_MS), now)).not.toBeNull();
    expect(verifiedXSource(urlAt(now.getTime()), now)).not.toBeNull();
    expect(verifiedXSource(urlAt(now.getTime() - RADAR_WINDOW_MS - 1), now)).toBeNull();
    expect(verifiedXSource(urlAt(now.getTime() + 1), now)).toBeNull();
    expect(verifiedXSource("https://example.com/test/status/123", now)).toBeNull();
    expect(verifiedXSource("", now)).toBeNull();
  });
  it("requires real X Search citations and removes duplicates", () => {
    const url = urlAt(now.getTime() - 3_600_000);
    expect(parseXDiscovery(response([url, url]), now).candidates).toHaveLength(1);
    expect(parseXDiscovery({ ...response([url]), citations: [] }, now).candidates).toHaveLength(0);
    expect(() =>
      parseXDiscovery(
        {
          ...response([url]),
          output: [{ type: "message", content: [{ type: "output_text", text: "bad JSON" }] }],
        },
        now,
      ),
    ).toThrow();
    expect(() => parseXDiscovery({ ...response([url]), usage: undefined }, now)).toThrow();
  });
  it("expires cached findings as the window moves", () => {
    const source = verifiedXSource(urlAt(now.getTime() - RADAR_WINDOW_MS + 1), now)!;
    const scan = { findings: [{ socialSources: [source] }] } as ResearchScan;
    expect(activeScan(scan, now).findings).toHaveLength(1);
    expect(activeScan(scan, new Date(now.getTime() + 2)).findings).toHaveLength(0);
  });
});

describe("Research Radar assessment", () => {
  afterEach(() => vi.restoreAllMocks());
  it("ranks relevant claims and removes duplicate techniques", () => {
    const source = verifiedXSource(urlAt(now.getTime() - 1000), now)!;
    expect(
      rankCandidates(
        [
          { ...candidate(source.url), source },
          { ...candidate(source.url), source },
          {
            ...candidate(source.url),
            title: "Unrelated marketing",
            claim: "Buy our product",
            summary: "A popular product",
            source,
          },
        ],
        context,
      ),
    ).toHaveLength(1);
  });
  it("completes a scan with a provider outage and refuses unsupported positive evidence", async () => {
    const source = verifiedXSource(urlAt(now.getTime() - 1000), now)!;
    const scan = await scanRadar(
      context,
      undefined,
      {
        discover: vi.fn(async () => ({
          candidates: [{ ...candidate(source.url), source }],
          queries: ["prerequisite graph"],
          usage: { xPostsFetched: 1, xSearchCalls: 1 },
        })),
        provider: {
          name: "openalex",
          search: vi.fn(async () => {
            throw new Error("outage");
          }),
        },
        assess: vi.fn(async () => ({
          status: "supported",
          rationale: "No actual evidence",
          supportingPaperIds: [],
          contradictingPaperIds: [],
          limitations: [],
          uncertainties: ["Needs experiment"],
          feasibility: "unknown",
          feasibilityExplanation: "Unknown",
          projectImpact: "further_investigation",
          projectImpactExplanation: "Research needed",
          recommendation: "monitor",
          recommendedSteps: ["Check evidence"],
        })) as unknown as typeof import("@/lib/ai/grok").generateJson,
      },
      now,
    );
    expect(scan.findings).toHaveLength(1);
    expect(scan.findings[0].claims[0].status).toBe("insufficient_evidence");
    expect(scan.warnings.some((warning) => warning.includes("Reddit was not searched"))).toBe(true);
    expect(scan.warnings.some((warning) => warning.includes("OpenAlex was unavailable"))).toBe(
      true,
    );
  });
});
