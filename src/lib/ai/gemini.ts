import "server-only";

import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { IntelligenceError } from "@/lib/intelligence/errors";

interface GenerateOptions {
  maxOutputTokens?: number;
  temperature?: number;
  signal?: AbortSignal;
  json?: boolean;
  jsonSchema?: object;
}

export async function generateText(prompt: string, options: GenerateOptions = {}): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey)
    throw new IntelligenceError("AI_NOT_CONFIGURED", "Gemini is not configured on the server.");

  try {
    const response = await new GoogleGenAI({ apiKey }).models.generateContent({
      model: process.env.GEMINI_MODEL ?? "gemini-flash-latest",
      contents: prompt,
      config: {
        maxOutputTokens: options.maxOutputTokens,
        temperature: options.temperature,
        abortSignal: options.signal,
        ...(options.json || options.jsonSchema ? { responseMimeType: "application/json" } : {}),
        ...(options.jsonSchema ? { responseJsonSchema: options.jsonSchema } : {}),
      },
    });
    if (!response.text)
      throw new IntelligenceError("PROVIDER_ERROR", "Gemini returned an empty response.");
    return response.text;
  } catch (error) {
    if (
      error instanceof IntelligenceError ||
      options.signal?.aborted ||
      (error instanceof DOMException && error.name === "AbortError")
    )
      throw error;
    throw new IntelligenceError("PROVIDER_ERROR", "Gemini could not complete the request.", {
      cause: error,
    });
  }
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
