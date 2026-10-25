import type { ResearchGap } from "@/types/gaps";
import type { SynthesisReport } from "@/types/synthesis";
import { isSupportedFinding } from "@/lib/synthesis/evidence-status";

export function exploreGaps(synthesis: SynthesisReport): ResearchGap[] {
  return synthesis.findings.flatMap((finding, index) => {
    if (finding.kind === "agreement" || !isSupportedFinding(finding)) return [];
    const relatedAgreements = synthesis.findings.filter(
      (item) =>
        item.kind === "agreement" &&
        isSupportedFinding(item) &&
        item.theme.trim().toLowerCase() === finding.theme.trim().toLowerCase(),
    );
    return [
      {
        id: `${synthesis.createdAt}:${index}`,
        sourceSynthesisCreatedAt: synthesis.createdAt,
        kind: finding.kind,
        theme: finding.theme,
        question:
          finding.kind === "difference"
            ? `Why do the selected papers differ on ${finding.theme}?`
            : `What remains unresolved about ${finding.theme}?`,
        evidence: finding.evidence,
        counterEvidence: relatedAgreements.flatMap((item) => item.evidence),
        documentIds: synthesis.documentIds,
        searchTerms: [finding.theme, `${finding.theme} systematic review`],
      },
    ];
  });
}
