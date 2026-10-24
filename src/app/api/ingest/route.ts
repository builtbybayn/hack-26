import { ingestFile, IngestionError } from "@/lib/ingestion";
import type { CommonErrorCode } from "@/types/api";
import { MAX_FILE_BYTES, type IngestionErrorCode, type IngestResponse } from "@/types/ingestion";

const STATUS_BY_CODE: Record<IngestionErrorCode, number> = {
  NO_FILE: 400,
  EMPTY_FILE: 422,
  FILE_TOO_LARGE: 413,
  UNSUPPORTED_FORMAT: 415,
  DECODE_FAILED: 422,
  PARSE_FAILED: 422,
};

/** Room for multipart boundaries and headers on top of the file itself. */
const MULTIPART_OVERHEAD_BYTES = 64 * 1024;

/**
 * POST /api/ingest
 * Body: multipart/form-data with a single `file` field.
 * Returns an `IngestResponse`. See docs/ARCHITECTURE.md#api-contract.
 */
export async function POST(request: Request): Promise<Response> {
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_FILE_BYTES + MULTIPART_OVERHEAD_BYTES) {
    return fail(
      413,
      "FILE_TOO_LARGE",
      `Files must be ${MAX_FILE_BYTES / (1024 * 1024)} MB or smaller.`,
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail(400, "INVALID_REQUEST", "Expected a multipart/form-data body with a `file` field.");
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return fail(400, "NO_FILE", "No file was provided in the `file` field.");
  }

  try {
    const data = await ingestFile(file);
    return Response.json({ ok: true, data } satisfies IngestResponse);
  } catch (error) {
    if (error instanceof IngestionError) {
      return fail(STATUS_BY_CODE[error.code], error.code, error.message);
    }
    console.error("[api/ingest] Unexpected failure", error);
    return fail(500, "INTERNAL_ERROR", "Something went wrong while processing the file.");
  }
}

function fail(status: number, code: IngestionErrorCode | CommonErrorCode, message: string) {
  return Response.json({ ok: false, error: { code, message } } satisfies IngestResponse, {
    status,
  });
}
