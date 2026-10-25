import { describe, expect, it } from "vitest";
import type { ParsedDocument } from "@/types/ingestion";
import type { SynthesisFinding } from "@/types/synthesis";
import { checkSynthesisFindings, synthesizePapers } from "./synthesize";

const documents = [
  {
    id: "a",
    title: "Paper A",
    source: { fileName: "a.pdf" },
    pages: [{ pageNumber: 1, text: "The method improved accuracy in adults." }],
  },
  {
    id: "b",
    title: "Paper B",
    source: { fileName: "b.pdf" },
    pages: [{ pageNumber: 2, text: "The method improved accuracy in children." }],
  },
] as ParsedDocument[];

function candidate(secondQuote = "The method improved accuracy in children."): {
  findings: SynthesisFinding[];
} {
  return {
    findings: [
      {
        kind: "agreement",
        theme: "Accuracy",
        summary: "Both papers report higher accuracy in different groups.",
        evidence: [
          { documentId: "a", pageNumber: 1, quote: "The method improved accuracy in adults." },
          { documentId: "b", pageNumber: 2, quote: secondQuote },
        ],
      },
    ],
  };
}

function checks(secondVerdict: "supported" | "contradicted" | "unclear" = "supported") {
  return {
    checks: [
      {
        index: 0,
        verdict: "supported",
        reason: "The passages jointly report improved accuracy.",
        sources: [
          { index: 1, verdict: secondVerdict, reason: "Paper B reports improvement." },
          { index: 0, verdict: "supported", reason: "Paper A reports improvement." },
        ],
      },
    ],
  };
}

describe("cross-paper synthesis", () => {
  it("keeps a finding supported by quotes from both papers", async () => {
    const report = await synthesizePapers(documents, async (prompt) =>
      JSON.stringify(prompt.startsWith("Synthesize") ? candidate() : checks()),
    );
    expect(report.documentIds).toEqual(["a", "b"]);
    expect(report.findings).toHaveLength(1);
    expect(report.findings[0].assessment?.verdict).toBe("supported");
    expect(report.findings[0].evidence.map((item) => item.assessment?.verdict)).toEqual([
      "supported",
      "supported",
    ]);
    expect(report.warnings).toEqual([]);
  });

  it("does not mark a comparison supported when a cited paper is unclear", async () => {
    const report = await synthesizePapers(documents, async (prompt) =>
      JSON.stringify(prompt.startsWith("Synthesize") ? candidate() : checks("unclear")),
    );
    expect(report.findings[0].assessment?.verdict).toBe("unclear");
    expect(report.findings[0].evidence[1].assessment?.verdict).toBe("unclear");
  });

  it("labels all interpretations unclear when the check is incomplete", async () => {
    const report = await synthesizePapers(documents, async (prompt) =>
      JSON.stringify(prompt.startsWith("Synthesize") ? candidate() : { checks: [] }),
    );
    expect(report.findings[0].assessment?.verdict).toBe("unclear");
    expect(
      report.findings[0].evidence.every((item) => item.assessment?.verdict === "unclear"),
    ).toBe(true);
    expect(report.warnings[0]).toContain("could not be checked");
  });

  it("rechecks a revised finding without changing the saved original", async () => {
    const original = candidate().findings[0];
    const revised = { ...original, summary: "The papers disagree." };
    const checked = await checkSynthesisFindings(documents, [revised], async () =>
      JSON.stringify(checks("contradicted")),
    );
    expect(checked.findings[0].summary).toBe("The papers disagree.");
    expect(checked.findings[0].evidence[1].assessment?.verdict).toBe("contradicted");
    expect(revised.evidence[1]).not.toHaveProperty("assessment");
  });

  it("rejects a revised finding with a fabricated source quote", async () => {
    await expect(
      checkSynthesisFindings(documents, candidate("fabricated passage").findings),
    ).rejects.toMatchObject({ code: "MODEL_RESPONSE_INVALID" });
  });

  it("removes findings with invented quotes or one-paper evidence", async () => {
    const invented = await synthesizePapers(documents, async () =>
      JSON.stringify(candidate("A fabricated sentence about accuracy.")),
    );
    expect(invented.findings).toHaveLength(0);
    const onePaper = candidate();
    onePaper.findings[0].evidence.pop();
    const insufficient = await synthesizePapers(documents, async () => JSON.stringify(onePaper));
    expect(insufficient.findings).toHaveLength(0);
  });

  it("rejects malformed model output", async () => {
    await expect(synthesizePapers(documents, async () => "not JSON")).rejects.toMatchObject({
      code: "MODEL_RESPONSE_INVALID",
    });
  });

  it("reports when a long paper is only partly reviewed", async () => {
    const longDocuments = [
      { ...documents[0], pages: [{ pageNumber: 1, text: "A".repeat(16_100) }] },
      documents[1],
    ];
    const report = await synthesizePapers(longDocuments, async () =>
      JSON.stringify({ findings: [] }),
    );
    expect(report.warnings[0]).toContain("first 16,000 characters");
  });
});
