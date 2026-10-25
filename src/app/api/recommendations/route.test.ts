import { afterEach, describe, expect, it, vi } from "vitest";
import fixture from "../../../../tests/fixtures/research/openalex.json";
import { MOCK_INGEST_SUCCESS } from "@/lib/api/ingest-mock";
import { POST } from "./route";

const body = {
  document: MOCK_INGEST_SUCCESS.data,
  analysis: {
    understanding: { subject: "Vector calculus", topics: [] },
    graph: { documentId: MOCK_INGEST_SUCCESS.data.id, concepts: [], foundationalConceptIds: [] },
  },
};
const post = (data: unknown) =>
  POST(
    new Request("http://localhost/api/recommendations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),
  );
afterEach(() => vi.unstubAllGlobals());

describe("POST /api/recommendations", () => {
  it("searches real provider records from a topic alone", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json(fixture));
    vi.stubGlobal("fetch", fetchMock);
    const response = await post({ topic: "vector calculus" });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true,
      data: {
        recommendations: expect.arrayContaining([
          expect.objectContaining({ paper: expect.objectContaining({ provider: "openalex" }) }),
        ]),
        queries: [{ text: "vector calculus", provider: "openalex" }],
      },
    });
    expect(fetchMock.mock.calls[0][0].searchParams.get("search")).toBe("vector calculus");
  });
  it("returns provider records in the standard envelope", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(fixture)));
    const response = await post(body);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true,
      data: {
        recommendations: expect.arrayContaining([
          expect.objectContaining({
            paper: expect.objectContaining({ provider: "openalex" }),
            reason: null,
          }),
        ]),
      },
    });
  });
  it("rejects malformed JSON and invalid documents before contacting a provider", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect((await post({})).status).toBe(400);
    expect((await post({ topic: "  " })).status).toBe(400);
    expect((await post({ topic: "valid topic", limit: 21 })).status).toBe(400);
    expect(
      (
        await POST(
          new Request("http://localhost/api/recommendations", { method: "POST", body: "{" }),
        )
      ).status,
    ).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each([
    [429, "SEARCH_RATE_LIMITED", 429],
    [503, "SEARCH_PROVIDER_ERROR", 502],
  ])("maps upstream %s to %s", async (upstream, code, status) => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: upstream as number })),
    );
    const response = await post(body);
    expect(response.status).toBe(status);
    expect(await response.json()).toMatchObject({ ok: false, error: { code } });
  });
});
