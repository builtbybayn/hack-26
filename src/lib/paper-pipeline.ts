/**
 * "Analyze this paper": save the paper, then run every analysis on it, saving each result.
 *
 *   saved ─▶ analysis ─▶ recommendations ─▶ contradictions
 *                        (related papers)    (vs. saved papers on its topics and the published
 *                                             papers just found, compared by abstract)
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
import { literatureDocument } from "@/lib/research/literature-document";
import type { ContradictionReport } from "@/types/contradictions";
import type { DocumentAnalysis } from "@/types/intelligence";
import type { ParsedDocument } from "@/types/ingestion";
import type { PaperPipeline, PipelineStep, PipelineStepId } from "@/types/pipeline";
import type { RecommendationsResult } from "@/types/research";

/** At most this many other papers are compared in the contradiction check (the API takes 4). */
const MAX_COMPARED_PAPERS = 3;
/** Saved papers get at most this many slots, so published work is always part of the check. */
const MAX_SAVED_PAPERS = 2;

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

  // 3. Related papers, then the contradiction check against saved papers and those it found.
  const related = await findRelatedPapers(document, analysis, stored, setStep, signal);
  await checkContradictions(document, analysis, stored, related, setStep, signal);
  return record!;
}

type SetStep = (id: PipelineStepId, step: PipelineStep, patch?: object) => Promise<void>;

async function findRelatedPapers(
  document: ParsedDocument,
  analysis: DocumentAnalysis,
  stored: DocumentRecord,
  setStep: SetStep,
  signal?: AbortSignal,
): Promise<RecommendationsResult | null> {
  if (stored.recommendations) {
    await setStep("recommendations", { status: "done", message: "Reused saved results." });
    return stored.recommendations;
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
    return result.data;
  }
  await setStep("recommendations", { status: "failed", message: result.error.message });
  return null;
}

/**
 * Compares the paper with saved papers on the same topics and with published papers found by the
 * related-papers search (by their abstracts), so conflicts with the wider literature show up too.
 */
async function checkContradictions(
  document: ParsedDocument,
  analysis: DocumentAnalysis,
  stored: DocumentRecord,
  related: RecommendationsResult | null,
  setStep: SetStep,
  signal?: AbortSignal,
) {
  const saved = (await listDocumentRecords())
    .filter(
      (entry): entry is DocumentRecord & { analysis: DocumentAnalysis } =>
        entry.id !== document.id && !!entry.analysis && topicsOverlap(analysis, entry.analysis),
    )
    .slice(0, MAX_SAVED_PAPERS);
  const savedTitles = new Set(
    [document, ...saved.map((entry) => entry.document)].map((item) => normalizeTitle(item.title)),
  );
  const literature = [...(related?.recommendations ?? [])]
    // Closest work first; foundational background is less likely to make the same claims.
    .sort((a, b) => Number(a.kind === "background") - Number(b.kind === "background"))
    .filter(({ paper }) => !savedTitles.has(normalizeTitle(paper.title)))
    .flatMap(({ paper }) => {
      const asDocument = literatureDocument(paper);
      return asDocument ? [{ paper, document: asDocument }] : [];
    })
    .slice(0, MAX_COMPARED_PAPERS - saved.length);

  if (!saved.length && !literature.length) {
    await setStep("contradictions", {
      status: "skipped",
      message: "No saved or published papers with abstracts to compare with yet.",
    });
    return;
  }
  const ids = [...saved.map((entry) => entry.id), ...literature.map(({ paper }) => paper.id)];
  const previous = stored.contradictions;
  if (previous && ids.every((id) => previous.documentIds.includes(id))) {
    await setStep("contradictions", { status: "done", message: "Reused saved results." });
    return;
  }

  await setStep("contradictions", { status: "running" });
  const result = await requestContradictions(
    {
      documents: [
        document,
        ...saved.map((entry) => entry.document),
        ...literature.map((entry) => entry.document),
      ],
      // Analyses must cover every document, and published papers only have abstracts.
      ...(literature.length
        ? {}
        : { analyses: [analysis, ...saved.map((entry) => entry.analysis)] }),
    },
    signal,
  );
  if (!result.ok) {
    await setStep("contradictions", { status: "failed", message: result.error.message });
    return;
  }
  const report: ContradictionReport = {
    ...result.data,
    sources: [
      { documentId: document.id, title: document.title ?? document.source.fileName, kind: "saved" },
      ...saved.map((entry) => ({
        documentId: entry.id,
        title: entry.document.title ?? entry.document.source.fileName,
        kind: "saved" as const,
      })),
      ...literature.map(({ paper }) => ({
        documentId: paper.id,
        title: paper.title,
        kind: "literature" as const,
        url: paper.url,
      })),
    ],
  };
  const count = report.findings.length;
  const compared = saved.length + literature.length;
  const from = [
    saved.length ? `${saved.length} saved` : null,
    literature.length ? `${literature.length} published` : null,
  ]
    .filter(Boolean)
    .join(" and ");
  await setStep(
    "contradictions",
    {
      status: "done",
      message: `${count} possible conflict${count === 1 ? "" : "s"} with ${from} paper${compared === 1 ? "" : "s"}.`,
    },
    { contradictions: report },
  );
}

function normalizeTitle(title: string | null): string {
  return (title ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
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
