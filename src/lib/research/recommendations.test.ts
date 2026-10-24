import { describe, expect, it, vi } from "vitest";
import { MOCK_INGEST_SUCCESS } from "@/lib/api/ingest-mock";
import type { PaperRecord } from "@/types/research";
import { recommendationsSchema, recommendPapers } from "./recommendations";

const input = () =>
  recommendationsSchema.parse({
    document: {
      ...MOCK_INGEST_SUCCESS.data,
      title: "Current paper",
      metadata: { doi: "10.1000/current" },
    },
    analysis: {
      understanding: { subject: "Vector calculus", topics: ["electromagnetism"] },
      graph: {
        documentId: MOCK_INGEST_SUCCESS.data.id,
        concepts: [
          { id: "vectors", name: "Vectors" },
          { id: "calculus", name: "Calculus" },
        ],
        foundationalConceptIds: ["vectors", "calculus"],
      },
    },
  });
const paper = (id: string, title: string, extra: Partial<PaperRecord> = {}): PaperRecord => ({
  id,
  title,
  authors: [],
  url: `https://openalex.org/${id}`,
  provider: "openalex",
  ...extra,
});

describe("recommendations", () => {
  it("builds bounded queries, excludes the source, deduplicates and merges addressed concepts", async () => {
    const search = vi
      .fn()
      .mockResolvedValueOnce([
        paper("self-title", "CURRENT: PAPER"),
        paper("self-doi", "Different title", { doi: "https://doi.org/10.1000/CURRENT" }),
        paper("background", "Vector calculus review", { doi: "https://doi.org/10.1000/review" }),
      ])
      .mockResolvedValueOnce([
        paper("duplicate-doi", "Alternate title", { doi: "10.1000/REVIEW" }),
        paper("duplicate-title", "Vector Calculus Review!"),
      ])
      .mockResolvedValueOnce([
        paper("related", "Vector calculus in electromagnetism", {
          abstract: "Electromagnetism and vector calculus.",
        }),
      ]);
    const result = await recommendPapers(input(), undefined, { name: "openalex", search });
    expect(result.recommendations.map((entry) => entry.paper.id)).toEqual([
      "background",
      "related",
    ]);
    expect(result.recommendations[0].conceptIds).toEqual(["vectors", "calculus"]);
    expect(result.recommendations.every((entry) => entry.reason === null)).toBe(true);
    expect(result.queries.map((query) => query.text)).toEqual([
      "vectors review",
      "calculus review",
      "vector calculus electromagnetism",
    ]);
    expect(result.warnings).toContain("Abstract unavailable for 1 results.");
  });

  it("ranks topical matches above irrelevant heavily cited records and fills both groups", async () => {
    const search = vi
      .fn()
      .mockResolvedValueOnce([paper("background", "Vectors review")])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        paper("unrelated", "History of pottery", { citationCount: 100_000 }),
        paper("related", "Vector calculus electromagnetism", {
          openAccessPdfUrl: "https://example.org/paper.pdf",
        }),
      ]);
    const result = await recommendPapers({ ...input(), limit: 2 }, undefined, {
      name: "openalex",
      search,
    });
    expect(result.recommendations.map((entry) => entry.paper.id)).toEqual([
      "background",
      "related",
    ]);
  });

  it("returns a successful empty result and caps foundation searches at three", async () => {
    const request = input();
    for (let i = 0; i < 5; i++) {
      request.analysis.graph.concepts.push({ id: `c${i}`, name: `Concept ${i}` });
      request.analysis.graph.foundationalConceptIds.push(`c${i}`);
    }
    const search = vi.fn().mockResolvedValue([]);
    const result = await recommendPapers(request, undefined, { name: "openalex", search });
    expect(search).toHaveBeenCalledTimes(4);
    expect(result.recommendations).toEqual([]);
    expect(result.warnings.join(" ")).toContain("No matching papers");
    expect(result.warnings.join(" ")).toContain("3 foundational concepts");
  });

  it("rejects invalid limits, missing inputs, and analyses for a different document", () => {
    expect(recommendationsSchema.safeParse({ ...input(), limit: 21 }).success).toBe(false);
    expect(recommendationsSchema.safeParse({ ...input(), limit: 0 }).success).toBe(false);
    expect(recommendationsSchema.safeParse({}).success).toBe(false);
    const request = input();
    request.analysis.graph.documentId = "another-document";
    expect(recommendationsSchema.safeParse(request).success).toBe(false);
  });
});
