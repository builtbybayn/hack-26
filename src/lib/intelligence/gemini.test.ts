import { describe, expect, it } from "vitest";
import type { ParsedDocument } from "@/types/ingestion";
import { analyzeDocument, chunkDocument } from "./gemini";

const document: ParsedDocument = {
  id: "maxwell",
  format: "pdf",
  sourceType: "pdf",
  source: { fileName: "maxwell.pdf", mimeType: "application/pdf", sizeBytes: 100 },
  title: "Maxwell's Equations",
  text: "Divergence and curl describe electric and magnetic fields.",
  pages: [{ pageNumber: 1, text: "Divergence and curl describe electric and magnetic fields." }],
  sections: [
    {
      id: "s1",
      heading: "Fields",
      level: 1,
      text: "Divergence and curl describe electric and magnetic fields.",
      pageNumbers: [1],
    },
  ],
  metadata: { pageCount: 1 },
  provenance: { parser: "standard", externalProcessing: false },
  stats: { characters: 57, words: 8, lines: 1 },
  warnings: [],
  parsedAt: "2026-01-01T00:00:00Z",
};

const valid = JSON.stringify({
  understanding: {
    subject: "Electromagnetism",
    topics: ["Maxwell equations"],
    terminology: ["curl"],
    equations: ["div E = rho/epsilon"],
    definitions: [],
    learningObjectives: ["Use Maxwell's equations"],
  },
  concepts: [
    {
      id: "vector-calculus",
      name: "Vector calculus",
      description: "Calculus of fields",
      difficulty: "intermediate",
      estimatedMinutes: 45,
      sourceReferences: [{ pageNumber: 1, quote: "Divergence and curl" }],
    },
    {
      id: "maxwell-equations",
      name: "Maxwell's equations",
      description: "Field laws",
      difficulty: "advanced",
      estimatedMinutes: 60,
      sourceReferences: [{ pageNumber: 1, quote: "electric and magnetic fields" }],
    },
  ],
  dependencies: [
    {
      prerequisiteId: "vector-calculus",
      dependentId: "maxwell-equations",
      evidenceType: "inferred",
      rationale: "Divergence and curl require vector calculus.",
    },
  ],
});

describe("Gemini analysis", () => {
  it("retries malformed model output and validates the graph", async () => {
    let calls = 0;
    const result = await analyzeDocument(document, {}, async () =>
      ++calls < 3 ? "not json" : valid,
    );
    expect(calls).toBe(3);
    expect(result.graph.topologicalOrder).toEqual(["vector-calculus", "maxwell-equations"]);
    expect(result.graph.concepts[0].sourceReferences).toHaveLength(1);
  });

  it("fails meaningfully after bounded malformed responses", async () => {
    await expect(analyzeDocument(document, {}, async () => "{}")).rejects.toMatchObject({
      code: "MODEL_RESPONSE_INVALID",
    });
  });

  it("chunks at section boundaries without dropping content", () => {
    const chunks = chunkDocument(
      {
        ...document,
        sections: [
          ...document.sections,
          { heading: "Second", level: 2, text: "x".repeat(200), pageNumbers: [2] },
        ],
      },
      100,
      10,
    );
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.join("")).toContain("Second");
  });
});
