import { describe, expect, it } from "vitest";
import type { ParsedDocument } from "@/types/ingestion";
import { reviewPapers } from "./review";

const documents = [
  {
    id: "a",
    title: "Paper A",
    source: { fileName: "a.pdf" },
    pages: [{ pageNumber: 1, text: "Treatment reduced symptoms in adults." }],
  },
  {
    id: "b",
    title: "Paper B",
    source: { fileName: "b.pdf" },
    pages: [{ pageNumber: 2, text: "Treatment increased symptoms in adults." }],
  },
] as [ParsedDocument, ParsedDocument];

function finding(quote = "Treatment increased symptoms in adults.") {
  return {
    findings: [
      {
        topic: "Treatment outcome",
        claims: [
          {
            documentId: "a",
            text: "Symptoms fell",
            conditions: "adults",
            pageNumber: 1,
            quote: "Treatment reduced symptoms in adults.",
          },
          { documentId: "b", text: "Symptoms rose", conditions: "adults", pageNumber: 2, quote },
        ],
        explanation: "The reported directions differ.",
        alternativeExplanations: ["Different cohorts"],
        verdict: "contradiction",
      },
    ],
  };
}

describe("critical review", () => {
  it("confirms a verified conflict only after independent Grok agreement", async () => {
    const report = await reviewPapers(
      documents,
      async () => JSON.stringify(finding()),
      async (prompt) => {
        expect(prompt).not.toContain("The reported directions differ.");
        return JSON.stringify({ reviews: [{ index: 0, verdict: "contradiction" }] });
      },
    );
    expect(report.findings[0]).toMatchObject({
      verdict: "contradiction",
      review: { gemini: "contradiction", grok: "contradiction" },
    });
  });

  it("keeps a candidate unconfirmed when Grok is unavailable or disagrees", async () => {
    const unavailable = await reviewPapers(documents, async () => JSON.stringify(finding()), null);
    expect(unavailable.findings[0].verdict).toBe("unclear");
    expect(unavailable.warnings).toContain(
      "Grok is not configured; conflicting claims remain unconfirmed.",
    );
    const disagreed = await reviewPapers(
      documents,
      async () => JSON.stringify(finding()),
      async () => JSON.stringify({ reviews: [{ index: 0, verdict: "compatible" }] }),
    );
    expect(disagreed.findings[0].review.grok).toBe("compatible");
    expect(disagreed.findings[0].verdict).toBe("unclear");
  });

  it("drops a finding with a fabricated quote", async () => {
    const report = await reviewPapers(
      documents,
      async () => JSON.stringify(finding("This quote is not on page two.")),
      null,
    );
    expect(report.findings).toHaveLength(0);
    expect(report.warnings[0]).toContain("source quotes could not be verified");
  });

  it("accepts a verified pair when the model returns papers in reverse order", async () => {
    const candidate = finding();
    candidate.findings[0].claims.reverse();
    const report = await reviewPapers(documents, async () => JSON.stringify(candidate), null);
    expect(report.findings[0].claims.map((claim) => claim.documentId)).toEqual(["a", "b"]);
  });
});
