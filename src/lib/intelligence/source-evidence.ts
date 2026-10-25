import type { DocumentAnalysis, EvidenceFeedback, SourceReference } from "@/types/intelligence";
import type { ParsedDocument } from "@/types/ingestion";

export function quoteAppearsOnPage(pageText: string, quote: string): boolean {
  const normalize = (value: string) => value.replace(/\s+/g, " ").trim().toLocaleLowerCase();
  return normalize(pageText).includes(normalize(quote));
}

export function evidencePassage(pageText: string, quote: string, contextChars = 3000): string {
  const normalized = pageText.replace(/\s+/g, " ");
  const normalizedQuote = quote.replace(/\s+/g, " ").trim();
  const position = normalized.toLocaleLowerCase().indexOf(normalizedQuote.toLocaleLowerCase());
  return normalized.slice(
    Math.max(0, position - contextChars),
    position + normalizedQuote.length + contextChars,
  );
}

export function evidenceFeedbackId(
  documentId: string,
  claim: string,
  reference: SourceReference,
): string {
  return JSON.stringify([documentId, claim, reference.pageNumber, reference.quote]);
}

export function evidenceAgreement(feedback: EvidenceFeedback[]): {
  reviewed: number;
  agreed: number;
  supportedReviewed: number;
  supportedAgreed: number;
} {
  return {
    reviewed: feedback.length,
    agreed: feedback.filter((entry) => entry.aiVerdict === entry.correctedVerdict).length,
    supportedReviewed: feedback.filter((entry) => entry.aiVerdict === "supported").length,
    supportedAgreed: feedback.filter(
      (entry) => entry.aiVerdict === "supported" && entry.correctedVerdict === "supported",
    ).length,
  };
}

export function evidenceEvaluationCases(document: ParsedDocument, feedback: EvidenceFeedback[]) {
  return feedback.flatMap((entry, index) => {
    const page = document.pages.find((item) => item.pageNumber === entry.pageNumber);
    return page
      ? [
          {
            index,
            claim: entry.claim,
            quote: entry.quote,
            pageNumber: entry.pageNumber,
            passage: evidencePassage(page.text, entry.quote),
            expectedVerdict: entry.correctedVerdict,
          },
        ]
      : [];
  });
}

export function verifyAnalysisReferences(
  document: ParsedDocument,
  analysis: DocumentAnalysis,
): DocumentAnalysis {
  let changed = false;
  const repairs = [...analysis.graph.repairs];
  const pages = new Map(document.pages.map((page) => [page.pageNumber, page.text]));
  const concepts = analysis.graph.concepts.map((concept) => {
    const sourceReferences = concept.sourceReferences.filter((reference) => {
      const text = pages.get(reference.pageNumber);
      return Boolean(text && reference.quote?.trim() && quoteAppearsOnPage(text, reference.quote));
    });
    const removed = concept.sourceReferences.length - sourceReferences.length;
    if (!removed) return concept;
    changed = true;
    repairs.push({
      type: "unverified-quote",
      message: `Removed ${removed} unverified source reference${removed === 1 ? "" : "s"} from “${concept.name}”.`,
    });
    return { ...concept, sourceReferences };
  });
  return changed ? { ...analysis, graph: { ...analysis.graph, concepts, repairs } } : analysis;
}
