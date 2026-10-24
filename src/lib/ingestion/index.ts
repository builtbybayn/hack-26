/**
 * Shared ingestion pipeline: input → validation → parsing → ParsedDocument.
 *
 * This is the only place file contents are parsed. Features and API routes
 * call `ingestFile` or `ingest`; they never decode or parse files themselves.
 */
import "server-only";

import { SUPPORTED_FORMATS, type DocumentFormat, type ParsedDocument } from "@/types/ingestion";
import { IngestionError } from "./errors";
import { parsers } from "./parsers";
import { validateInput } from "./validate";

export { IngestionError } from "./errors";

export interface IngestInput {
  fileName: string;
  /** MIME type as reported by the source. May be empty. */
  mimeType: string;
  bytes: Uint8Array;
}

/** Ingests raw bytes from any source (an upload, a fetch, a fixture). */
export async function ingest(input: IngestInput): Promise<ParsedDocument> {
  const format = validateInput({ ...input, sizeBytes: input.bytes.byteLength });
  return parse(input, format);
}

/** Ingests a Web `File`, e.g. from `request.formData()`. Checks size before reading it. */
export async function ingestFile(file: File): Promise<ParsedDocument> {
  const meta = { fileName: file.name, mimeType: file.type };
  const format = validateInput({ ...meta, sizeBytes: file.size });
  const bytes = new Uint8Array(await file.arrayBuffer());
  return parse({ ...meta, bytes }, format);
}

async function parse(input: IngestInput, format: DocumentFormat): Promise<ParsedDocument> {
  let output;
  try {
    output = await parsers[format](input.bytes);
  } catch (error) {
    if (error instanceof IngestionError) throw error;
    throw new IngestionError(
      "PARSE_FAILED",
      `Could not parse this ${SUPPORTED_FORMATS[format].label.toLowerCase()} file.`,
      { cause: error },
    );
  }

  if (output.text.trim() === "") {
    throw new IngestionError("EMPTY_FILE", "The file contains no readable text.");
  }

  return {
    format,
    source: {
      fileName: input.fileName,
      mimeType: input.mimeType,
      sizeBytes: input.bytes.byteLength,
    },
    title: output.title,
    text: output.text,
    sections: output.sections,
    stats: countStats(output.text),
    warnings: output.warnings,
    parsedAt: new Date().toISOString(),
  };
}

function countStats(text: string): ParsedDocument["stats"] {
  return {
    characters: text.length,
    words: text.split(/\s+/).filter(Boolean).length,
    lines: text.replace(/\n$/, "").split("\n").length,
  };
}
