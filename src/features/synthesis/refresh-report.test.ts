import { expect, it } from "vitest";
import type { SynthesisReport } from "@/types/synthesis";
import { refreshReport } from "./refresh-report";

it("updates checks without rewriting findings or losing coverage warnings", () => {
  const report: SynthesisReport = {
    documentIds: ["a", "b"],
    findings: [{ kind: "agreement", theme: "Accuracy", summary: "Both improved.", evidence: [] }],
    warnings: [
      "Paper A: only the first 16,000 characters were synthesized.",
      "1 finding(s) could not be checked for interpretation.",
    ],
    createdAt: "2026-01-01T00:00:00.000Z",
  };
  const finding = {
    ...report.findings[0],
    assessment: { verdict: "supported" as const, reason: "Both passages agree." },
  };
  const refreshed = refreshReport(report, { findings: [finding], warnings: [] });
  expect(refreshed.findings[0]).toMatchObject({
    summary: "Both improved.",
    assessment: { verdict: "supported" },
  });
  expect(refreshed.warnings).toEqual([
    "Paper A: only the first 16,000 characters were synthesized.",
  ]);
  expect(refreshed.createdAt).not.toBe(report.createdAt);
  expect(report.findings[0].assessment).toBeUndefined();
});
