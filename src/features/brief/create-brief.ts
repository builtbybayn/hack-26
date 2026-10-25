import type { ResearchBrief } from "@/types/brief";
import type { SynthesisReport } from "@/types/synthesis";
import type { PaperRecord } from "@/types/research";

export function createResearchBrief(
  projectName: string,
  synthesis: SynthesisReport,
  papers: PaperRecord[],
): ResearchBrief {
  return {
    title: `${projectName} — Research Brief`,
    researchQuestion: `What do the selected papers show about ${projectName}?`,
    researcherNotes: "",
    sourceSynthesisCreatedAt: synthesis.createdAt,
    documentIds: [...synthesis.documentIds],
    findings: synthesis.findings.map((finding) => ({
      ...finding,
      evidence: [...finding.evidence],
      checkedSummary: finding.assessment ? finding.summary : undefined,
      included: true,
      edited: false,
    })),
    readingList: [...papers],
    updatedAt: new Date().toISOString(),
  };
}

export function editBriefFinding(
  finding: ResearchBrief["findings"][number],
  summary: string,
): ResearchBrief["findings"][number] {
  return {
    ...finding,
    summary,
    edited: true,
    checkedSummary: undefined,
    assessment: undefined,
    evidence: finding.evidence.map((source) => ({ ...source, assessment: undefined })),
  };
}
