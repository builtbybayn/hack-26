import {
  ACCEPTED_EXTENSIONS,
  MAX_FILE_BYTES,
  SUPPORTED_FORMATS,
  type DocumentFormat,
} from "@/types/ingestion";
import { IngestionError } from "./errors";

const FORMATS = Object.entries(SUPPORTED_FORMATS) as [
  DocumentFormat,
  (typeof SUPPORTED_FORMATS)[DocumentFormat],
][];

/**
 * Detects a format from the file extension first, then the MIME type.
 * Extensions win because browsers often report `.md` files as
 * `application/octet-stream` or leave the type empty.
 */
export function detectFormat(fileName: string, mimeType: string): DocumentFormat | null {
  const dot = fileName.lastIndexOf(".");
  const extension = dot === -1 ? "" : fileName.slice(dot).toLowerCase();
  const baseMime = mimeType.split(";")[0].trim().toLowerCase();

  const byExtension = FORMATS.find(([, spec]) =>
    (spec.extensions as readonly string[]).includes(extension),
  );
  if (byExtension) return byExtension[0];

  const byMime = FORMATS.find(([, spec]) =>
    (spec.mimeTypes as readonly string[]).includes(baseMime),
  );
  return byMime ? byMime[0] : null;
}

/** Checks size and format before any bytes are parsed. Throws `IngestionError`. */
export function validateInput(input: {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}): DocumentFormat {
  if (input.sizeBytes === 0) {
    throw new IngestionError("EMPTY_FILE", "The file is empty.");
  }
  if (input.sizeBytes > MAX_FILE_BYTES) {
    const limitMb = MAX_FILE_BYTES / (1024 * 1024);
    throw new IngestionError("FILE_TOO_LARGE", `Files must be ${limitMb} MB or smaller.`);
  }

  const format = detectFormat(input.fileName, input.mimeType);
  if (!format) {
    throw new IngestionError(
      "UNSUPPORTED_FORMAT",
      `Unsupported file type. Accepted: ${ACCEPTED_EXTENSIONS.join(", ")}.`,
    );
  }
  return format;
}
