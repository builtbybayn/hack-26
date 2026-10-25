import type { SynthesisCheckResponse, SynthesisReport } from "@/types/synthesis";

export function refreshReport(
  report: SynthesisReport,
  checked: Extract<SynthesisCheckResponse, { ok: true }>["data"],
): SynthesisReport {
  return {
    ...report,
    findings: checked.findings,
    warnings: [
      ...report.warnings.filter(
        (warning) => !/^\d+ finding\(s\) could not be checked for interpretation\.$/.test(warning),
      ),
      ...checked.warnings,
    ],
    createdAt: new Date().toISOString(),
  };
}
