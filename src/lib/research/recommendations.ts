import "server-only";

import { z } from "zod";
import { documentInputSchema } from "@/lib/intelligence/schema";
import { openAlex, type ResearchProvider } from "./provider";
import type { PaperRecommendation, RecommendationsResult } from "@/types/research";

const searchText = z.string().trim().min(1).max(500);
export const recommendationsSchema = z
  .object({
    document: documentInputSchema.extend({
      metadata: z.object({ doi: z.string().optional(), DOI: z.string().optional() }).optional(),
    }),
    analysis: z.object({
      understanding: z.object({ subject: searchText, topics: z.array(searchText).max(30) }),
      graph: z.object({
        documentId: z.string(),
        concepts: z.array(z.object({ id: searchText, name: searchText })).max(60),
        foundationalConceptIds: z.array(searchText).max(60),
      }),
    }),
    limit: z.number().int().min(1).max(20).default(8),
  })
  .refine(({ document, analysis }) => document.id === analysis.graph.documentId, {
    message: "The analysis must belong to this document.",
  });

export const topicRecommendationsSchema = z.object({
  topic: z.string().trim().min(3).max(240),
  limit: z.number().int().min(1).max(20).default(8),
});

export async function searchTopicPapers(
  input: z.infer<typeof topicRecommendationsSchema>,
  signal?: AbortSignal,
  provider: ResearchProvider = openAlex,
): Promise<RecommendationsResult> {
  const query = input.topic.replace(/\s+/g, " ");
  const papers = await provider.search(query, { limit: input.limit, signal });
  const missingAbstracts = papers.filter((paper) => !paper.abstract).length;
  return {
    recommendations: papers.map((paper) => ({
      paper,
      kind: "related",
      conceptIds: [],
      reason: null,
    })),
    queries: [
      { text: query, kind: "related", provider: provider.name, resultCount: papers.length },
    ],
    warnings: [
      ...(!papers.length ? ["No matching papers found. Try a more specific topic."] : []),
      ...(missingAbstracts ? [`Abstract unavailable for ${missingAbstracts} results.`] : []),
    ],
  };
}

type Input = z.infer<typeof recommendationsSchema>;
const normalize = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
const doiKey = (value: string) =>
  value
    .toLowerCase()
    .replace(/^(https?:\/\/(?:dx\.)?doi\.org\/|doi:\s*)/, "")
    .trim();

export async function recommendPapers(
  input: Input,
  signal?: AbortSignal,
  provider: ResearchProvider = openAlex,
): Promise<RecommendationsResult> {
  const { document, analysis, limit } = input;
  // shortcut: search three foundations per request; expand when broader coverage is needed.
  const foundations = analysis.graph.concepts
    .filter((concept) => analysis.graph.foundationalConceptIds.includes(concept.id))
    .slice(0, 3);
  const searches: { text: string; kind: PaperRecommendation["kind"]; conceptIds: string[] }[] =
    foundations.map((concept) => ({
      text: `${normalize(concept.name).slice(0, 200)} review`,
      kind: "background",
      conceptIds: [concept.id],
    }));
  const related = normalize(
    [analysis.understanding.subject, ...analysis.understanding.topics.slice(0, 2)].join(" "),
  ).slice(0, 240);
  if (related) searches.push({ text: related, kind: "related", conceptIds: [] });
  const results = await Promise.all(
    searches.map((query) => provider.search(query.text, { limit: Math.max(5, limit), signal })),
  );
  const sourceDoi = document.metadata?.doi ?? document.metadata?.DOI;
  const candidates: PaperRecommendation[] = [];
  const byId = new Map<string, PaperRecommendation>();
  const byDoi = new Map<string, PaperRecommendation>();
  const byTitle = new Map<string, PaperRecommendation>();
  results.forEach((papers, index) => {
    for (const paper of papers) {
      const title = normalize(paper.title);
      const doi = paper.doi ? doiKey(paper.doi) : undefined;
      if (
        (document.title && title === normalize(document.title)) ||
        (sourceDoi && doi === doiKey(sourceDoi))
      )
        continue;
      const existing =
        byId.get(paper.id) ?? (doi ? byDoi.get(doi) : undefined) ?? byTitle.get(title);
      if (existing) {
        existing.conceptIds = [...new Set([...existing.conceptIds, ...searches[index].conceptIds])];
        byId.set(paper.id, existing);
        if (doi) byDoi.set(doi, existing);
        byTitle.set(title, existing);
        continue;
      }
      const candidate = {
        paper,
        kind: searches[index].kind,
        conceptIds: [...searches[index].conceptIds],
        reason: null,
      };
      candidates.push(candidate);
      byId.set(paper.id, candidate);
      if (doi) byDoi.set(doi, candidate);
      byTitle.set(title, candidate);
    }
  });
  const terms = new Set(
    normalize([analysis.understanding.subject, ...analysis.understanding.topics].join(" "))
      .split(" ")
      .filter((term) => term.length > 2),
  );
  const score = ({ paper }: PaperRecommendation) => {
    const words = new Set(normalize(`${paper.title} ${paper.abstract ?? ""}`).split(" "));
    const overlap = [...terms].filter((term) => words.has(term)).length;
    const age = Math.max(0, new Date().getFullYear() - (paper.year ?? 0));
    return (
      overlap * 10 +
      Math.log10(1 + (paper.citationCount ?? 0)) +
      (paper.openAccessPdfUrl ? 1 : 0) +
      1 / (1 + age)
    );
  };
  candidates.sort((a, b) => score(b) - score(a) || a.paper.id.localeCompare(b.paper.id));
  const background = candidates.filter((entry) => entry.kind === "background");
  const relatedPapers = candidates.filter((entry) => entry.kind === "related");
  const recommendations: PaperRecommendation[] = [];
  while (recommendations.length < limit && (background.length || relatedPapers.length)) {
    const next =
      recommendations.length % 2 === 0
        ? (background.shift() ?? relatedPapers.shift())
        : (relatedPapers.shift() ?? background.shift());
    if (next) recommendations.push(next);
  }
  const missingAbstracts = recommendations.filter(({ paper }) => !paper.abstract).length;
  const warnings: string[] = [];
  if (!recommendations.length)
    warnings.push("No matching papers found. Try again with another paper or topic.");
  if (missingAbstracts) warnings.push(`Abstract unavailable for ${missingAbstracts} results.`);
  if (analysis.graph.foundationalConceptIds.length > foundations.length)
    warnings.push(
      `Background search covers ${foundations.length} foundational concepts this time.`,
    );
  return {
    recommendations,
    queries: searches.map((query, index) => ({
      text: query.text,
      kind: query.kind,
      provider: provider.name,
      resultCount: results[index].length,
    })),
    warnings,
  };
}
