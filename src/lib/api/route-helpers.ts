import "server-only";

import { IntelligenceError } from "@/lib/intelligence/errors";
import { IngestionError } from "@/lib/ingestion";

export function success<T>(data: T, status = 200): Response {
  return Response.json({ ok: true, data }, { status });
}

export function failure(code: string, message: string, status = 400): Response {
  return Response.json({ ok: false, error: { code, message } }, { status });
}

/** Thrown by `readJson` when a body exceeds its size limit. */
class RequestTooLargeError extends Error {}

export function routeError(error: unknown, route: string): Response {
  if (error instanceof RequestTooLargeError) {
    return failure("INVALID_REQUEST", "The request body is too large.", 413);
  }
  if (error instanceof SyntaxError) {
    return failure("INVALID_REQUEST", "The request body is not valid JSON.", 400);
  }
  if (error instanceof IntelligenceError) {
    const status =
      error.code === "CONSENT_REQUIRED"
        ? 403
        : error.code === "REQUEST_TIMEOUT"
          ? 504
          : error.code === "AI_NOT_CONFIGURED" || error.code === "OCR_NOT_CONFIGURED"
            ? 503
            : error.code === "MODEL_RESPONSE_INVALID"
              ? 422
              : 502;
    return failure(error.code, error.message, status);
  }
  if (error instanceof IngestionError) {
    const status =
      error.code === "FILE_TOO_LARGE" ? 413 : error.code === "UNSUPPORTED_FORMAT" ? 415 : 422;
    return failure(error.code, error.message, status);
  }
  if (error instanceof DOMException && error.name === "AbortError")
    return failure("REQUEST_TIMEOUT", "The request was cancelled or timed out.", 408);
  console.error(`[${route}] Unexpected failure`, error);
  return failure("INTERNAL_ERROR", "Something went wrong while processing the request.", 500);
}

/** Request bodies carry whole parsed documents, so the default limit is generous. */
export async function readJson(request: Request, maxBytes = 20_000_000): Promise<unknown> {
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > maxBytes) throw new RequestTooLargeError();
  return request.json();
}

export function timeoutSignal(request: Request, milliseconds: number): AbortSignal {
  return AbortSignal.any([request.signal, AbortSignal.timeout(milliseconds)]);
}
