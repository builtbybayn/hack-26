/**
 * "Analyze this paper": save the paper, then run every analysis on it, saving each result.
 *
 *   saved ─▶ analysis ─┬▶ recommendations   (related papers, Track B)
 *                      └▶ contradictions    (vs. saved papers sharing its topics, Track A)
 *
 * Runs in the browser because the browser owns stored papers. Each step's status is persisted on
 * the record, so closing the panel loses nothing and re-running skips finished work. Activity
 * states (for the sprite) come from the API clients this calls.
 */
import { requestContradictions } from "@/lib/api/contradictions-client";
import { analyzeDocument } from "@/lib/api/intelligence-client";
import { requestRecommendations } from "@/lib/api/research-client";
import {
  getDocumentRecord,
  listDocumentRecords,
  saveDocument,
  savePaperFile,
  updateDocumentRecord,
  type DocumentRecord,
} from "@/lib/browser-store";
import type { DocumentAnalysis } from "@/types/intelligence";
import type { ParsedDocument } from "@/types/ingestion";
import type { PaperPipeline, PipelineStep, PipelineStepId } from "@/types/pipeline";

/** At most this many other papers are compared in the contradiction check. */
const MAX_COMPARED_PAPERS = 3;

export interface PipelineOptions {
  /** The original file, kept for the vault. */
  file?: { blob: Blob; fileName: string };
  signal?: AbortSignal;
  /** Called after every step change with the latest record. */
  onUpdate?: (record: DocumentRecord) => void;
}

export async function runPaperPipeline(
  document: ParsedDocument,
  options: PipelineOptions = {},
): Promise<DocumentRecord> {
  const { signal, onUpdate } = options;
  const pipeline: PaperPipeline = {
    saved: { status: "running" },
    analysis: { status: "pending" },
    recommendations: { status: "pending" },
    contradictions: { status: "pending" },
  };
  let record: DocumentRecord;

  // Steps 3a and 3b finish concurrently; queue record writes so neither overwrites the other.
  let writes = Promise.resolve();
  const setStep = (id: PipelineStepId, step: PipelineStep, patch = {}) =>
    (writes = writes.then(async () => {
      pipeline[id] = step;
      record = (await updateDocumentRecord(document.id, { ...patch, pipeline: { ...pipeline } }))!;
      onUpdate?.(record);
    }));

  // 1. Save the paper (and its original file) so it is in the vault even if analysis fails.
  await saveDocument(document);
  if (options.file) {
    await savePaperFile(document.id, options.file.blob, options.file.fileName).catch(() => {});
  }
  const stored = (await getDocumentRecord(document.id))!;
  await setStep("saved", { status: "done" });

  // 2. Concept analysis (Gemini), reused when the paper was analyzed before.
  let analysis = stored.analysis;
  if (analysis) {
    await setStep("analysis", { status: "done", message: "Reused the saved analysis." });
  } else {
    await setStep("analysis", { status: "running" });
    const result = await analyzeDocument({ document }, signal);
    if (!result.ok) {
      await setStep("analysis", { status: "failed", message: result.error.message });
      const needsAnalysis = { status: "skipped", message: "Needs the analysis first." } as const;
      await setStep("recommendations", needsAnalysis);
      await setStep("contradictions", needsAnalysis);
      return record!;
    }
    analysis = result.data.analysis;
    await setStep("analysis", { status: "done" }, { analysis });
  }

  // 3. Related papers and the contradiction check are independent; run them together.
  await Promise.all([
    findRelatedPapers(document, analysis, stored, setStep, signal),
    checkContradictions(document, analysis, stored, setStep, signal),
  ]);
  return record!;
}

type SetStep = (id: PipelineStepId, step: PipelineStep, patch?: object) => Promise<void>;

async function findRelatedPapers(
  document: ParsedDocument,
  analysis: DocumentAnalysis,
  stored: DocumentRecord,
  setStep: SetStep,
  signal?: AbortSignal,
) {
  if (stored.recommendations) {
    await setStep("recommendations", { status: "done", message: "Reused saved results." });
    return;
  }
  await setStep("recommendations", { status: "running" });
  const result = await requestRecommendations({ document, analysis }, signal);
  if (result.ok) {
    const count = result.data.recommendations.length;
    await setStep(
      "recommendations",
      { status: "done", message: `${count} paper${count === 1 ? "" : "s"} found.` },
      { recommendations: result.data },
    );
  } else {
    await setStep("recommendations", { status: "failed", message: result.error.message });
  }
}

async function checkContradictions(
  document: ParsedDocument,
  analysis: DocumentAnalysis,
  stored: DocumentRecord,
  setStep: SetStep,
  signal?: AbortSignal,
) {
  const others = (await listDocumentRecords())
    .filter(
      (entry): entry is DocumentRecord & { analysis: DocumentAnalysis } =>
        entry.id !== document.id && !!entry.analysis && topicsOverlap(analysis, entry.analysis),
    )
    .slice(0, MAX_COMPARED_PAPERS);
  if (!others.length) {
    await setStep("contradictions", {
      status: "skipped",
      message: "No other saved paper shares its topics yet.",
    });
    return;
  }
  const previous = stored.contradictions;
  if (previous && others.every((entry) => previous.documentIds.includes(entry.id))) {
    await setStep("contradictions", { status: "done", message: "Reused saved results." });
    return;
  }

  await setStep("contradictions", { status: "running" });
  const result = await requestContradictions(
    {
      documents: [document, ...others.map((entry) => entry.document)],
      analyses: [analysis, ...others.map((entry) => entry.analysis)],
    },
    signal,
  );
  if (result.ok) {
    const count = result.data.findings.length;
    await setStep(
      "contradictions",
      {
        status: "done",
        message: `${count} possible conflict${count === 1 ? "" : "s"} across ${others.length + 1} papers.`,
      },
      { contradictions: result.data },
    );
  } else {
    await setStep("contradictions", { status: "failed", message: result.error.message });
  }
}

const STOP_WORDS = new Set([
  "study",
  "studies",
  "analysis",
  "method",
  "methods",
  "result",
  "theory",
]);

/** Whether two analyses share a topic word (4+ letters), so comparing them is worthwhile. */
export function topicsOverlap(first: DocumentAnalysis, second: DocumentAnalysis): boolean {
  const words = (analysis: DocumentAnalysis) =>
    new Set(
      [analysis.understanding.subject, ...analysis.understanding.topics]
        .join(" ")
        .toLowerCase()
        .match(/[a-z0-9]{4,}/g)
        ?.filter((word) => !STOP_WORDS.has(word)) ?? [],
    );
  const left = words(first);
  return [...words(second)].some((word) => left.has(word));
}
