import { expect, it } from "vitest";
import type { PaperRecord } from "@/types/research";
import type { SynthesisReport } from "@/types/synthesis";
import { createResearchBrief, editBriefFinding } from "./create-brief";

it("builds an editable brief while retaining synthesis evidence and paper records", () => {
  const synthesis: SynthesisReport = {
    documentIds: ["a", "b"],
    createdAt: "2026-10-24T00:00:00.000Z",
    warnings: [],
    findings: [
      {
        kind: "agreement",
        theme: "Accuracy",
        summary: "Both report gains.",
        evidence: [
          { documentId: "a", pageNumber: 1, quote: "Accuracy improved in adults." },
          { documentId: "b", pageNumber: 2, quote: "Accuracy improved in children." },
        ],
      },
    ],
  };
  const papers = [
    {
      id: "openalex:1",
      title: "Background",
      authors: [],
      url: "https://openalex.org/W1",
      provider: "openalex",
    },
  ] as PaperRecord[];
  const brief = createResearchBrief("Accuracy", synthesis, papers);
  expect(brief.findings[0]).toMatchObject({
    included: true,
    edited: false,
    evidence: synthesis.findings[0].evidence,
  });
  expect(brief.sourceSynthesisCreatedAt).toBe(synthesis.createdAt);
  expect(brief.readingList).toEqual(papers);
  const checked = {
    ...brief.findings[0],
    assessment: { verdict: "supported" as const, reason: "Both passages agree." },
    checkedSummary: brief.findings[0].summary,
    evidence: brief.findings[0].evidence.map((item) => ({
      ...item,
      assessment: { verdict: "supported" as const, reason: "The passage supports it." },
    })),
  };
  const edited = editBriefFinding(checked, "The papers disagree.");
  expect(edited).toMatchObject({ summary: "The papers disagree.", edited: true });
  expect(edited.assessment).toBeUndefined();
  expect(edited.checkedSummary).toBeUndefined();
  expect(edited.evidence.every((item) => item.assessment === undefined)).toBe(true);
  expect(checked.assessment.verdict).toBe("supported");
  brief.findings[0].evidence.pop();
  expect(synthesis.findings[0].evidence).toHaveLength(2);
});
