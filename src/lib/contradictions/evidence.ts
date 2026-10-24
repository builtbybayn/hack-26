import type { ParsedDocument } from "@/types/ingestion";
import type { DocumentAnalysis, SourceReference } from "@/types/intelligence";

function normalize(text: string): string {
  return text.normalize("NFKC").replace(/\s+/g, " ").trim().toLocaleLowerCase();
}

export function quoteIsOnPage(document: ParsedDocument, reference: SourceReference): boolean {
  if (!reference.quote?.trim()) return false;
  const page = document.pages.find((entry) => entry.pageNumber === reference.pageNumber);
  return !!page && normalize(page.text).includes(normalize(reference.quote));
}

export function verifyConceptEvidence(
  document: ParsedDocument,
  analysis: DocumentAnalysis,
): DocumentAnalysis {
  let removed = 0;
  const concepts = analysis.graph.concepts.map((concept) => ({
    ...concept,
    sourceReferences: concept.sourceReferences.filter((reference) => {
      const valid = !reference.quote || quoteIsOnPage(document, reference);
      if (!valid) removed += 1;
      return valid;
    }),
  }));
  if (!removed) return analysis;
  return {
    ...analysis,
    graph: {
      ...analysis.graph,
      concepts,
      repairs: [
        ...analysis.graph.repairs,
        {
          type: "unverified-quote",
          message: `Removed ${removed} quote(s) that could not be found on the cited page.`,
        },
      ],
    },
  };
}
