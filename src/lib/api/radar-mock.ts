import type { ResearchScan } from "@/types/radar";

/** Contract fixture only; the News tab never displays fixture findings as live research. */
export const MOCK_RADAR_SCAN = {
  id: "fixture-scan",
  projectId: "fixture-project",
  scannedAt: "2026-01-01T00:00:00.000Z",
  windowStart: "2025-12-25T00:00:00.000Z",
  contextSummary: "Fixture research project",
  sourcesSearched: ["X"],
  warnings: ["Fixture contains no live research."],
  findings: [],
} satisfies ResearchScan;
