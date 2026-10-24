import { afterEach, describe, expect, it, vi } from "vitest";
import fixture from "../../../tests/fixtures/research/openalex.json";
import { MOCK_RECOMMENDATIONS } from "@/lib/api/research-mock";
import { openAlex, reconstructAbstract } from "./provider";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("OpenAlex adapter", () => {
  it("normalizes recorded real records and keeps the mock in sync", async () => {
    vi.stubEnv("OPENALEX_API_KEY", "test-secret");
    const fetchMock = vi.fn().mockResolvedValue(Response.json(fixture));
    vi.stubGlobal("fetch", fetchMock);
    const papers = await openAlex.search("vector calculus", { limit: 5 });
    expect(papers).toHaveLength(5);
    expect(papers[0].abstract).toBeUndefined();
    for (const { paper } of MOCK_RECOMMENDATIONS.data.recommendations) {
      expect(papers.find((entry) => entry.id === paper.id)).toMatchObject(paper);
    }
    const [url, options] = fetchMock.mock.calls[0];
    expect(url.searchParams.get("search")).toBe("vector calculus");
    expect(url.href).not.toContain("test-secret");
    expect(options.headers.Authorization).toBe("Bearer test-secret");
    expect(options.signal).toBeInstanceOf(AbortSignal);
  });

  it("reconstructs abstract order and repeated words without sparse allocations", () => {
    expect(reconstructAbstract({ vectors: [1], Study: [0, 2], carefully: [3] })).toBe(
      "Study vectors Study carefully",
    );
    expect(reconstructAbstract({ word: [1_000_000_000] })).toBe("word");
    expect(reconstructAbstract(null)).toBeUndefined();
    expect(reconstructAbstract({})).toBeUndefined();
  });

  it("works without a key and refuses unsafe provider PDF links", async () => {
    vi.stubEnv("OPENALEX_API_KEY", "");
    const record = {
      ...fixture.results[0],
      best_oa_location: { is_oa: true, pdf_url: "javascript:alert(1)" },
    };
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ results: [record] }));
    vi.stubGlobal("fetch", fetchMock);
    expect((await openAlex.search("vectors", { limit: 5 }))[0].openAccessPdfUrl).toBeUndefined();
    expect(fetchMock.mock.calls[0][1].headers).toEqual({});
  });

  it.each([
    [429, "SEARCH_RATE_LIMITED"],
    [403, "SEARCH_PROVIDER_ERROR"],
    [500, "SEARCH_PROVIDER_ERROR"],
  ])("maps provider HTTP %s to %s", async (status, code) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status })));
    await expect(openAlex.search("vectors", { limit: 5 })).rejects.toMatchObject({ code });
  });

  it("sanitizes network and malformed-response failures", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("secret URL"))
      .mockResolvedValueOnce(Response.json({ results: [{ id: "bad" }] }));
    vi.stubGlobal("fetch", fetchMock);
    for (let i = 0; i < 2; i++) {
      await expect(openAlex.search("vectors", { limit: 5 })).rejects.toMatchObject({
        code: "SEARCH_PROVIDER_ERROR",
      });
    }
  });

  it("enforces a provider timeout and preserves request cancellation", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new DOMException("Timed out", "TimeoutError")),
    );
    await expect(openAlex.search("vectors", { limit: 5 })).rejects.toMatchObject({
      code: "SEARCH_PROVIDER_ERROR",
    });
    const controller = new AbortController();
    controller.abort();
    await expect(
      openAlex.search("vectors", { limit: 5, signal: controller.signal }),
    ).rejects.toMatchObject({ name: "AbortError" });
  });
});
