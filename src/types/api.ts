/**
 * The response envelope every API route in this app returns.
 *
 * Consumers branch on `ok` instead of HTTP status codes, so success and
 * failure always have a predictable shape:
 *
 *   const res = await uploadDocument(file);
 *   if (res.ok) use(res.data);
 *   else show(res.error.message);
 */
export type ApiResponse<TData, TCode extends string = string> =
  { ok: true; data: TData } | { ok: false; error: ApiError<TCode> };

export interface ApiError<TCode extends string = string> {
  /** Stable, machine-readable identifier. Safe to switch on. */
  code: TCode;
  /** Human-readable explanation. Safe to show to end users. */
  message: string;
}

/** Codes any endpoint (or the client wrapper) may return. */
export type CommonErrorCode = "INVALID_REQUEST" | "INTERNAL_ERROR" | "NETWORK_ERROR";
