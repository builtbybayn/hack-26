/**
 * The "Analyze this paper" pipeline: save → analysis → related papers + contradiction check.
 * Each step's status is stored on the paper's record so any view (panel, vault) can show progress
 * or resume. Browser-safe types only.
 */

export type PipelineStepId = "saved" | "analysis" | "recommendations" | "contradictions";

export type PipelineStepStatus = "pending" | "running" | "done" | "skipped" | "failed";

export interface PipelineStep {
  status: PipelineStepStatus;
  /** Why a step was skipped or failed, or what it found. */
  message?: string;
}

export type PaperPipeline = Record<PipelineStepId, PipelineStep>;

export const PIPELINE_STEPS: { id: PipelineStepId; label: string }[] = [
  { id: "saved", label: "Saved to your vault" },
  { id: "analysis", label: "Concepts and prerequisites" },
  { id: "recommendations", label: "Related papers" },
  { id: "contradictions", label: "Contradiction check" },
];
