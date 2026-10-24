import type { IngestionErrorCode } from "@/types/ingestion";

/**
 * The only error type the ingestion module throws on purpose. Anything else
 * escaping `ingest()` is a bug and should surface as an internal error.
 */
export class IngestionError extends Error {
  readonly code: IngestionErrorCode;

  constructor(code: IngestionErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "IngestionError";
    this.code = code;
  }
}
