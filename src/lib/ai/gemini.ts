import "server-only";

import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { IntelligenceError } from "@/lib/intelligence/errors";

/**
 * A pinned model: the `gemini-flash-latest` alias stopped answering (requests hang) for new keys.
 * Override with GEMINI_MODEL.
 */
export const DEFAULT_GEMINI_MODEL = "gemini-3.5-flash";
/** A stuck provider call fails with REQUEST_TIMEOUT instead of hanging the request. */
export const GEMINI_TIMEOUT_MS = 120_000;

export function geminiModel(): string {
  return process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL;
}

/** The caller's signal (if any) combined with the default timeout. */
export function geminiSignal(signal?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(GEMINI_TIMEOUT_MS);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

interface GenerateOptions {
  maxOutputTokens?: number;
  temperature?: number;
  signal?: AbortSignal;
  json?: boolean;
  jsonSchema?: object;
}

/**
 * Calls Gemini. Temporary provider failures (overloaded, rate limited, internal errors) are
 * retried with backoff, then retried on the fallback model, so a demand spike on one model
 * doesn't fail the request.
 */
export async function generateText(prompt: string, options: GenerateOptions = {}): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey)
    throw new IntelligenceError("AI_NOT_CONFIGURED", "Gemini is not configured on the server.");

  const signal = geminiSignal(options.signal);
  const ai = new GoogleGenAI({ apiKey });
  let lastError: unknown;
  for (const [index, attempt] of attemptPlan().entries()) {
    if (attempt.delayMs) await sleep(attempt.delayMs, signal);
    try {
      const response = await ai.models.generateContent({
        model: attempt.model,
        contents: prompt,
        config: {
          maxOutputTokens: options.maxOutputTokens,
          temperature: options.temperature,
          abortSignal: signal,
          ...(options.json || options.jsonSchema ? { responseMimeType: "application/json" } : {}),
          ...(options.jsonSchema ? { responseJsonSchema: options.jsonSchema } : {}),
        },
      });
      if (!response.text)
        throw new IntelligenceError("PROVIDER_ERROR", "Gemini returned an empty response.");
      return response.text;
    } catch (error) {
      if (signal.aborted && !options.signal?.aborted)
        throw new IntelligenceError(
          "REQUEST_TIMEOUT",
          "Gemini took too long to respond. Try again.",
          { cause: error },
        );
      if (
        error instanceof IntelligenceError ||
        options.signal?.aborted ||
        (error instanceof DOMException && error.name === "AbortError")
      )
        throw error;
      lastError = error;
      // The provider's reason (never the key), for diagnosing failures from server logs.
      console.error(
        `[gemini] ${attempt.model} attempt ${index + 1} failed:`,
        error instanceof Error ? error.message : error,
      );
      if (!isTransientGeminiError(error)) break;
    }
  }
  throw isTransientGeminiError(lastError)
    ? new IntelligenceError(
        "PROVIDER_ERROR",
        "Gemini is busy right now. Please try again in a minute.",
        { cause: lastError },
      )
    : new IntelligenceError("PROVIDER_ERROR", "Gemini could not complete the request.", {
        cause: lastError,
      });
}

/** Used when the primary model stays overloaded. Override with GEMINI_FALLBACK_MODEL. */
export const DEFAULT_FALLBACK_MODEL = "gemini-2.5-flash";

/** Primary model twice (the second after a pause), then the fallback model twice. */
function attemptPlan(): { model: string; delayMs: number }[] {
  const primary = geminiModel();
  const fallback = process.env.GEMINI_FALLBACK_MODEL || DEFAULT_FALLBACK_MODEL;
  const plan = [
    { model: primary, delayMs: 0 },
    { model: primary, delayMs: 1_500 },
  ];
  if (fallback !== primary)
    plan.push({ model: fallback, delayMs: 0 }, { model: fallback, delayMs: 2_000 });
  return plan;
}

/** Overloaded (503), rate limited (429), or an internal provider error (500): worth retrying. */
export function isTransientGeminiError(error: unknown): boolean {
  const status = (error as { status?: unknown } | null)?.status;
  if (typeof status === "number") return [429, 500, 503].includes(status);
  const message = error instanceof Error ? error.message : String(error ?? "");
  return (
    /(429|500|503)|UNAVAILABLE|RESOURCE_EXHAUSTED/.test(message) ||
    /high demand|overloaded/i.test(message)
  );
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

export async function generateJson<T>(
  prompt: string,
  schema: z.ZodType<T>,
  options: GenerateOptions & { retries?: number } = {},
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= (options.retries ?? 2); attempt += 1) {
    const raw = await generateText(prompt, { ...options, json: true });
    try {
      return schema.parse(
        JSON.parse(
          raw
            .trim()
            .replace(/^```(?:json)?\s*/i, "")
            .replace(/\s*```$/, ""),
        ),
      );
    } catch (error) {
      lastError = error;
      console.error(
        "[gemini] structured output rejected:",
        error instanceof Error ? error.message.slice(0, 500) : error,
      );
    }
  }
  throw new IntelligenceError(
    "MODEL_RESPONSE_INVALID",
    "Gemini returned invalid structured output.",
    {
      cause: lastError,
    },
  );
}
