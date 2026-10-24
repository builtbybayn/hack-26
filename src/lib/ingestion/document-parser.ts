import type { ParsedDocument } from "@/types/ingestion";

export interface PDFInput {
  bytes: Uint8Array;
  fileName: string;
  mimeType?: string;
  documentId?: string;
}

export interface ParseOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
}

export interface DocumentParser {
  parse(input: PDFInput, options?: ParseOptions): Promise<ParsedDocument>;
}
