/**
 * Ingestion contract: shared by the server-side ingestion module, the
 * `/api/ingest` route, and any frontend code that displays parsed documents.
 *
 * This file is browser-safe (types and constants only). Changing it changes
 * the API contract, so coordinate through a PR (see docs/CONTRIBUTING.md).
 */
import type { ApiResponse, CommonErrorCode } from "./api";

/**
 * Formats the ingestion module can parse. This table is the single source of
 * truth for format detection; the server keeps a parser per entry, and the
 * compiler flags any format that is missing one.
 */
export const SUPPORTED_FORMATS = {
  text: {
    label: "Plain text",
    extensions: [".txt", ".text"],
    mimeTypes: ["text/plain"],
  },
  markdown: {
    label: "Markdown",
    extensions: [".md", ".markdown"],
    mimeTypes: ["text/markdown", "text/x-markdown"],
  },
  pdf: {
    label: "PDF document",
    extensions: [".pdf"],
    mimeTypes: ["application/pdf"],
  },
} as const satisfies Record<
  string,
  { label: string; extensions: readonly string[]; mimeTypes: readonly string[] }
>;

export type DocumentFormat = keyof typeof SUPPORTED_FORMATS;

/** Maximum accepted upload size, in bytes (25 MB). */
export const MAX_FILE_BYTES = 25 * 1024 * 1024;

/** Every extension we accept, e.g. for an `<input accept>` attribute. */
export const ACCEPTED_EXTENSIONS = Object.values(SUPPORTED_FORMATS).flatMap(
  (format) => format.extensions,
);

/** A contiguous part of a document, split on headings where the format has them. */
export interface DocumentSection {
  id?: string;
  /** Heading text, or `null` for content before the first heading. */
  heading: string | null;
  /** Heading depth (1–6), or `0` when there is no heading. */
  level: number;
  /** The section body, without its heading line. */
  text: string;
  /** Original PDF pages represented by this section. */
  pageNumbers?: number[];
}

export interface ParsedTable {
  markdown: string;
  rows?: string[][];
}

export interface ParsedPage {
  pageNumber: number;
  text: string;
  markdown?: string;
  equations?: string[];
  tables?: ParsedTable[];
}

export interface DocumentMetadata {
  author?: string;
  subject?: string;
  keywords?: string[];
  pageCount?: number;
  createdAt?: string;
  modifiedAt?: string;
  [key: string]: string | number | string[] | undefined;
}

export interface ExtractionQuality {
  score: number;
  needsOcr: boolean;
  reasons: string[];
  charactersPerPage: number;
  readablePageRatio: number;
}

export type ParserMethod = "standard" | "mistral" | "mathpix";

/** The normalized result every consumer can rely on, whatever the input format. */
export interface ParsedDocument {
  /** Stable SHA-256 content identifier. */
  id: string;
  format: DocumentFormat;
  sourceType: "pdf" | "webpage" | "text";
  source: {
    fileName: string;
    /** MIME type reported by the uploader; may be empty or generic. */
    mimeType: string;
    sizeBytes: number;
  };
  /** Best-guess title (e.g. the first Markdown H1), or `null`. */
  title: string | null;
  /** Full text content: UTF-8, `\n` line endings, no byte-order mark. */
  text: string;
  pages: ParsedPage[];
  sections: DocumentSection[];
  metadata: DocumentMetadata;
  provenance: {
    parser: ParserMethod | "text" | "markdown";
    externalProcessing: boolean;
  };
  extractionQuality?: ExtractionQuality;
  stats: {
    characters: number;
    words: number;
    lines: number;
  };
  /** Non-fatal issues found while parsing. Empty when there were none. */
  warnings: string[];
  /** ISO 8601 timestamp of when parsing finished. */
  parsedAt: string;
}

export type IngestionErrorCode =
  | "NO_FILE"
  | "EMPTY_FILE"
  | "FILE_TOO_LARGE"
  | "UNSUPPORTED_FORMAT"
  | "DECODE_FAILED"
  | "PARSE_FAILED";

/** Response body of `POST /api/ingest`. */
export type IngestResponse = ApiResponse<ParsedDocument, IngestionErrorCode | CommonErrorCode>;
