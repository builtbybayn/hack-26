import { expect, it } from "vitest";
import type { SynthesisReport } from "@/types/synthesis";
import { exploreGaps } from "./explore-gaps";

it("turns unresolved synthesis findings into scoped questions with related evidence", () => {
  const synthesis: SynthesisReport = {
    createdAt: "2026-10-24T00:00:00.000Z",
    documentIds: ["a", "b"],
    warnings: [],
    findings: [
      {
        kind: "difference",
        theme: "Accuracy",
        summary: "Results differ",
        assessment: { verdict: "supported", reason: "The comparison follows." },
        evidence: [
          {
            documentId: "a",
            pageNumber: 1,
            quote: "Accuracy rose in adults.",
            assessment: { verdict: "supported", reason: "Source supports it." },
          },
          {
            documentId: "b",
            pageNumber: 2,
            quote: "Accuracy fell in children.",
            assessment: { verdict: "supported", reason: "Source supports it." },
          },
        ],
      },
      {
        kind: "agreement",
        theme: "accuracy",
        summary: "Some results align",
        assessment: { verdict: "supported", reason: "The comparison follows." },
        evidence: [
          {
            documentId: "a",
            pageNumber: 1,
            quote: "Accuracy rose in adults.",
            assessment: { verdict: "supported", reason: "Source supports it." },
          },
          {
            documentId: "b",
            pageNumber: 2,
            quote: "Accuracy rose in children.",
            assessment: { verdict: "supported", reason: "Source supports it." },
          },
        ],
      },
      {
        kind: "open_question",
        theme: "Long term effects",
        summary: "Follow-up is limited",
        assessment: { verdict: "supported", reason: "The limitation is explicit." },
        evidence: [
          {
            documentId: "b",
            pageNumber: 3,
            quote: "Long term effects remain unknown.",
            assessment: { verdict: "supported", reason: "Source supports it." },
          },
        ],
      },
    ],
  };
  const gaps = exploreGaps(synthesis);
  expect(gaps).toHaveLength(2);
  expect(gaps[0]).toMatchObject({
    id: `${synthesis.createdAt}:0`,
    kind: "difference",
    documentIds: ["a", "b"],
    counterEvidence: synthesis.findings[1].evidence,
  });
  expect(gaps[1].counterEvidence).toEqual([]);
  expect(gaps[1].question).toContain("Long term effects");
  const unchecked = {
    ...synthesis,
    findings: synthesis.findings.map((finding, index) =>
      index === 0
        ? { ...finding, assessment: { verdict: "unclear" as const, reason: "Not established." } }
        : finding,
    ),
  };
  expect(exploreGaps(unchecked).map((gap) => gap.kind)).toEqual(["open_question"]);
  const weakCounterEvidence = {
    ...synthesis,
    findings: synthesis.findings.map((finding, index) =>
      index === 1
        ? {
            ...finding,
            assessment: { verdict: "contradicted" as const, reason: "Opposing evidence." },
          }
        : finding,
    ),
  };
  expect(exploreGaps(weakCounterEvidence)[0].counterEvidence).toEqual([]);
});
