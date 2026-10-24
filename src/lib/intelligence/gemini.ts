import "server-only";

import { GoogleGenAI } from "@google/genai";
import type { DocumentAnalysis, MasteryLevel } from "@/types/intelligence";
import type { ParsedDocument } from "@/types/ingestion";
import { IntelligenceError } from "./errors";
import { validateGraph } from "./graph";
import { buildLearningPath } from "./learning-path";
import { MODEL_ANALYSIS_JSON_SCHEMA, modelAnalysisSchema } from "./schema";

export type GenerateJson = (prompt: string) => Promise<string>;

export async function analyzeDocument(
  document: ParsedDocument,
  mastery: Record<string, MasteryLevel> = {},
  generateJson: GenerateJson = createGeminiGenerator(),
): Promise<DocumentAnalysis> {
  const chunks = chunkDocument(document);
  const prompt = `You are building a prerequisite knowledge graph for an academic document.
Analyze the document excerpts below. Identify the subject, topics, terminology, equations, definitions,
learning objectives, and the important concepts a learner must understand. Include prerequisites even when
they are not taught in the document. Mark a dependency "source" only when the excerpts explicitly support it;
otherwise mark it "inferred" and explain the inference in the rationale. Use stable lowercase kebab-case IDs.
Keep source quotes short and cite real page numbers. Produce no more than 40 concepts.

DOCUMENT ID: ${document.id}
TITLE: ${document.title ?? document.source.fileName}

${chunks.map((chunk, index) => `--- EXCERPT ${index + 1} ---\n${chunk}`).join("\n\n")}`;

  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const raw = await generateJson(
        attempt === 0
          ? prompt
          : `${prompt}\n\nPrevious output was invalid. Return only JSON matching the required schema.`,
      );
      const parsed = modelAnalysisSchema.parse(JSON.parse(stripCodeFence(raw)));
      const graph = validateGraph({
        documentId: document.id,
        concepts: parsed.concepts,
        dependencies: parsed.dependencies,
      });
      return {
        understanding: parsed.understanding,
        graph,
        learningPath: buildLearningPath(graph, mastery),
      };
    } catch (error) {
      // Configuration and provider failures won't fix themselves; only malformed output is retried.
      if (error instanceof IntelligenceError) throw error;
      lastError = error;
    }
  }
  throw new IntelligenceError(
    "MODEL_RESPONSE_INVALID",
    "Gemini returned an invalid analysis after three attempts.",
    { cause: lastError },
  );
}

export function createGeminiGenerator(): GenerateJson {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey)
    return async () => {
      throw new IntelligenceError("AI_NOT_CONFIGURED", "Gemini is not configured on the server.");
    };
  const ai = new GoogleGenAI({ apiKey });
  return async (prompt) => {
    const response = await ai.models.generateContent({
      model: process.env.GEMINI_MODEL ?? "gemini-flash-latest",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseJsonSchema: MODEL_ANALYSIS_JSON_SCHEMA,
        maxOutputTokens: 12_000,
        temperature: 0.2,
      },
    });
    if (!response.text)
      throw new IntelligenceError("PROVIDER_ERROR", "Gemini returned an empty response.");
    return response.text;
  };
}

export function chunkDocument(
  document: ParsedDocument,
  maxCharacters = 12_000,
  maxChunks = 12,
): string[] {
  const units = document.sections.length
    ? document.sections.map(
        (section) =>
          `[Pages ${section.pageNumbers?.join(", ") ?? "unknown"}] ${section.heading ? `## ${section.heading}\n` : ""}${section.text}`,
      )
    : document.pages.map((page) => `[Page ${page.pageNumber}]\n${page.markdown ?? page.text}`);
  const chunks: string[] = [];
  let current = "";
  for (const unit of units) {
    if (current && current.length + unit.length > maxCharacters) {
      chunks.push(current);
      current = "";
    }
    if (unit.length > maxCharacters) {
      for (let offset = 0; offset < unit.length; offset += maxCharacters)
        chunks.push(unit.slice(offset, offset + maxCharacters));
    } else current += `${current ? "\n\n" : ""}${unit}`;
    if (chunks.length >= maxChunks) break;
  }
  if (current && chunks.length < maxChunks) chunks.push(current);
  return chunks.slice(0, maxChunks);
}

function stripCodeFence(value: string): string {
  return value
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
}
