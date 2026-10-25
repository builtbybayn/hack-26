import "server-only";

import { z } from "zod";
import { IntelligenceError } from "@/lib/intelligence/errors";

export function isGrokConfigured(): boolean {
  return !!process.env.XAI_API_KEY;
}

export async function generateJson<T>(
  prompt: string,
  schema: z.ZodType<T>,
  options: { retries?: number; signal?: AbortSignal } = {},
): Promise<T> {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey)
    throw new IntelligenceError("AI_NOT_CONFIGURED", "Grok is not configured on the server.");

  let lastError: unknown;
  for (let attempt = 0; attempt <= (options.retries ?? 1); attempt += 1) {
    let response: Response;
    try {
      response = await fetch("https://api.x.ai/v1/responses", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: process.env.XAI_MODEL ?? "grok-4.7",
          store: false,
          input: prompt,
          text: {
            format: {
              type: "json_schema",
              name: "contradiction_review",
              schema: z.toJSONSchema(schema),
              strict: true,
            },
          },
        }),
        signal: options.signal,
      });
    } catch (error) {
      if (options.signal?.aborted) throw error;
      throw new IntelligenceError("PROVIDER_ERROR", "Grok could not complete the request.", {
        cause: error,
      });
    }
    if (!response.ok)
      throw new IntelligenceError("PROVIDER_ERROR", `Grok returned HTTP ${response.status}.`);

    try {
      const body = await response.json();
      const content = body.output
        ?.flatMap((item: { content?: { type: string; text?: string }[] }) => item.content ?? [])
        .find((item: { type: string; text?: string }) => item.type === "output_text")?.text;
      return schema.parse(JSON.parse(content));
    } catch (error) {
      if (options.signal?.aborted) throw error;
      lastError = error;
    }
  }
  throw new IntelligenceError(
    "MODEL_RESPONSE_INVALID",
    "Grok returned invalid structured output.",
    {
      cause: lastError,
    },
  );
}
