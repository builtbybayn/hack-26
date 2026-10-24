import "server-only";

import type { DocumentAnalysis } from "@/types/intelligence";
import type { ParsedDocument } from "@/types/ingestion";

interface StoreState {
  documents: Map<string, ParsedDocument>;
  analyses: Map<string, DocumentAnalysis>;
}

const globalStore = globalThis as typeof globalThis & { __knowBeforeStore?: StoreState };
const store = (globalStore.__knowBeforeStore ??= {
  documents: new Map(),
  analyses: new Map(),
});

export function putDocument(document: ParsedDocument): void {
  store.documents.set(document.id, document);
}

export function getDocument(documentId: string): ParsedDocument | undefined {
  return store.documents.get(documentId);
}

export function putAnalysis(documentId: string, analysis: DocumentAnalysis): void {
  store.analyses.set(documentId, analysis);
}

export function getAnalysis(documentId: string): DocumentAnalysis | undefined {
  return store.analyses.get(documentId);
}

export function clearStoreForTests(): void {
  store.documents.clear();
  store.analyses.clear();
}
