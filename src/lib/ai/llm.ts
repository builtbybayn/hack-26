import "server-only";

import { z } from "zod";
import { IntelligenceError } from "@/lib/intelligence/errors";
import { generateText as generateGeminiText } from "./gemini";
import { generateLuminalText, isLuminalConfigured } from "./luminal";

/**
 * The one entry point for model calls. Luminal (OpenAI-compatible) is used when LUMINAL_API_KEY
 * is set; Gemini (GEMINI_API_KEY) is the fallback when Luminal is busy or failing, and the only
 * provider when Luminal isn't configured.
 */
export interface GenerateOptions {
  maxOutputTokens?: number;
  temperature?: number;
  signal?: AbortSignal;
  json?: boolean;
  jsonSchema?: object;
}

type Provider = {
  name: "luminal" | "gemini";
  generate: (prompt: string, options: GenerateOptions) => Promise<string>;
};

/** Configured providers, in the order they're tried. */
export function providers(): Provider[] {
  return [
    ...(isLuminalConfigured() ? [{ name: "luminal" as const, generate: generateLuminalText }] : []),
    ...(process.env.GEMINI_API_KEY
      ? [{ name: "gemini" as const, generate: generateGeminiText }]
      : []),
  ];
}

export function isAiConfigured(): boolean {
  return providers().length > 0;
}

export async function generateText(prompt: string, options: GenerateOptions = {}): Promise<string> {
  const available = providers();
  if (!available.length)
    throw new IntelligenceError(
      "AI_NOT_CONFIGURED",
      "No AI provider is configured on the server. Set LUMINAL_API_KEY (or GEMINI_API_KEY).",
    );
  let lastError: unknown;
  for (const provider of available) {
    try {
      return await provider.generate(prompt, options);
    } catch (error) {
      // Cancellation and unusable output aren't fixed by switching providers.
      if (
        options.signal?.aborted ||
        !(error instanceof IntelligenceError) ||
        !["PROVIDER_ERROR", "REQUEST_TIMEOUT"].includes(error.code)
      )
        throw error;
      lastError = error;
      if (available.length > 1)
        console.error(`[ai] ${provider.name} failed; trying the next provider.`, error.message);
    }
  }
  throw lastError;
}

export async function generateJson<T>(
  prompt: string,
  schema: z.ZodType<T>,
  options: GenerateOptions & { retries?: number } = {},
): Promise<T> {
  // State the exact shape the validator expects, so any provider can match it.
  const shaped = options.jsonSchema ? prompt : `${prompt}${schemaInstructions(schema)}`;
  let lastError: unknown;
  for (let attempt = 0; attempt <= (options.retries ?? 2); attempt += 1) {
    const raw = await generateText(
      attempt === 0
        ? shaped
        : `${shaped}\n\nYour previous reply did not match the schema. Reply with matching JSON only.`,
      { ...options, json: true },
    );
    try {
      return schema.parse(JSON.parse(stripCodeFence(raw)));
    } catch (error) {
      lastError = error;
      console.error(
        "[ai] structured output rejected:",
        error instanceof Error ? error.message.slice(0, 500) : error,
      );
    }
  }
  throw new IntelligenceError(
    "MODEL_RESPONSE_INVALID",
    "The AI model returned invalid structured output.",
    { cause: lastError },
  );
}

/** The validator's shape as a JSON Schema instruction, or nothing if it can't be expressed. */
export function schemaInstructions(schema: z.ZodType): string {
  try {
    const jsonSchema = z.toJSONSchema(schema, { unrepresentable: "any" });
    return `\n\nRespond with only a JSON object that matches this JSON Schema exactly, using these field names:\n${JSON.stringify(jsonSchema)}`;
  } catch {
    return "";
  }
}

/** Models sometimes wrap JSON in a Markdown code fence or add a sentence around it. */
export function stripCodeFence(raw: string): string {
  const trimmed = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) return trimmed;
  const start = trimmed.search(/[{[]/);
  const end = Math.max(trimmed.lastIndexOf("}"), trimmed.lastIndexOf("]"));
  return start >= 0 && end > start ? trimmed.slice(start, end + 1) : trimmed;
}
