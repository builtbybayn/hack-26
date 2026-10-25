import type { SynthesisFinding } from "@/types/synthesis";

export function isSupportedFinding(finding: SynthesisFinding): boolean {
  return (
    finding.assessment?.verdict === "supported" &&
    finding.evidence.length > 0 &&
    finding.evidence.every((item) => item.assessment?.verdict === "supported") &&
    (finding.kind === "open_question" ||
      new Set(finding.evidence.map((item) => item.documentId)).size >= 2)
  );
}
