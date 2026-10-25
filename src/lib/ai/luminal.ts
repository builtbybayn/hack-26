import "server-only";

import { IntelligenceError } from "@/lib/intelligence/errors";

/**
 * Luminal: an OpenAI-compatible chat completions API (https://flash.luminal.cloud/v1), called
 * with plain `fetch`. Configure with LUMINAL_API_KEY; LUMINAL_BASE_URL and LUMINAL_MODEL override
 * the defaults. Server-only: the key never reaches the browser.
 */
export const DEFAULT_LUMINAL_BASE_URL = "https://flash.luminal.cloud/v1";
export const DEFAULT_LUMINAL_MODEL = "deepseek-ai/DeepSeek-V4.1-Flash";
/** A stuck call fails with REQUEST_TIMEOUT instead of hanging the request. */
export const LUMINAL_TIMEOUT_MS = 120_000;
/** Attempts per call; rate limits and server errors are retried with backoff. */
const ATTEMPTS = 3;
const MAX_RETRY_WAIT_MS = 10_000;

export interface LuminalOptions {
  maxOutputTokens?: number;
  temperature?: number;
  signal?: AbortSignal;
  json?: boolean;
  /** JSON Schema for the response. Not enforced by the API, so it's described in the prompt. */
  jsonSchema?: object;
}

export function isLuminalConfigured(): boolean {
  return Boolean(process.env.LUMINAL_API_KEY);
}

export function luminalModel(): string {
  return process.env.LUMINAL_MODEL || DEFAULT_LUMINAL_MODEL;
}

/** An HTTP failure from the API, kept so callers can tell transient errors from fatal ones. */
export class LuminalHttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly retryAfterMs: number | null = null,
  ) {
    super(message);
    this.name = "LuminalHttpError";
  }
}

export async function generateLuminalText(
  prompt: string,
  options: LuminalOptions = {},
): Promise<string> {
  const apiKey = process.env.LUMINAL_API_KEY;
  if (!apiKey)
    throw new IntelligenceError("AI_NOT_CONFIGURED", "Luminal is not configured on the server.");

  const timeout = AbortSignal.timeout(LUMINAL_TIMEOUT_MS);
  const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
  const wantsJson = Boolean(options.json || options.jsonSchema);
  let useResponseFormat = wantsJson;
  let lastError: unknown;

  for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
    try {
      return await complete(apiKey, withSchema(prompt, options.jsonSchema), {
        ...options,
        signal,
        responseFormat: useResponseFormat,
      });
    } catch (error) {
      if (timeout.aborted && !options.signal?.aborted)
        throw new IntelligenceError("REQUEST_TIMEOUT", "The AI model took too long to respond.", {
          cause: error,
        });
      if (options.signal?.aborted || (error instanceof DOMException && error.name === "AbortError"))
        throw error;
      if (error instanceof IntelligenceError) throw error;
      lastError = error;
      // The provider's reason (never the key), for diagnosing failures from server logs.
      console.error(
        `[luminal] ${luminalModel()} attempt ${attempt} failed:`,
        error instanceof Error ? error.message : error,
      );
      // Some OpenAI-compatible servers reject `response_format`; the prompt still asks for JSON.
      if (error instanceof LuminalHttpError && error.status === 400 && useResponseFormat) {
        useResponseFormat = false;
        continue;
      }
      if (!isTransientLuminalError(error)) break;
      if (attempt < ATTEMPTS) await sleep(retryDelay(error, attempt), signal);
    }
  }

  if (lastError instanceof LuminalHttpError && [401, 403].includes(lastError.status))
    throw new IntelligenceError("PROVIDER_ERROR", "Luminal rejected the API key.", {
      cause: lastError,
    });
  throw new IntelligenceError(
    "PROVIDER_ERROR",
    isTransientLuminalError(lastError)
      ? "The AI model is busy right now. Please try again in a minute."
      : "The AI model could not complete the request.",
    { cause: lastError },
  );
}

async function complete(
  apiKey: string,
  prompt: string,
  options: LuminalOptions & { signal: AbortSignal; responseFormat: boolean },
): Promise<string> {
  const base = (process.env.LUMINAL_BASE_URL || DEFAULT_LUMINAL_BASE_URL).replace(/\/+$/, "");
  const response = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: luminalModel(),
      messages: [{ role: "user", content: prompt }],
      ...(options.maxOutputTokens ? { max_tokens: options.maxOutputTokens } : {}),
      ...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
      ...(options.responseFormat ? { response_format: { type: "json_object" } } : {}),
    }),
    signal: options.signal,
  });
  if (!response.ok) {
    const detail = (await response.text().catch(() => "")).slice(0, 300);
    const retryAfter = Number(response.headers.get("retry-after"));
    throw new LuminalHttpError(
      response.status,
      `HTTP ${response.status}${detail ? `: ${detail}` : ""}`,
      Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1_000 : null,
    );
  }
  const data = (await response.json()) as {
    choices?: { message?: { content?: string | null } }[];
  };
  const text = stripReasoning(data.choices?.[0]?.message?.content ?? "");
  if (!text)
    throw new IntelligenceError("PROVIDER_ERROR", "The AI model returned an empty response.");
  return text;
}

/** Reasoning models may prepend their thinking; callers only want the answer. */
export function stripReasoning(content: string): string {
  return content.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
}

function withSchema(prompt: string, schema?: object): string {
  if (!schema) return prompt;
  return `${prompt}\n\nRespond with only a JSON object that matches this JSON Schema:\n${JSON.stringify(schema)}`;
}

/** Rate limited (429), or a server-side failure (5xx): worth retrying. */
export function isTransientLuminalError(error: unknown): boolean {
  if (error instanceof LuminalHttpError) return error.status === 429 || error.status >= 500;
  // Network failures (connection reset, DNS) surface as TypeError from fetch.
  return error instanceof TypeError;
}

function retryDelay(error: unknown, attempt: number): number {
  const suggested = error instanceof LuminalHttpError ? error.retryAfterMs : null;
  return Math.min(suggested ?? 1_000 * 2 ** (attempt - 1), MAX_RETRY_WAIT_MS);
}

function sleep(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, milliseconds);
    signal.addEventListener("abort", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}
