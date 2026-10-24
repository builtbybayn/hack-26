import "server-only";

import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import type { ExplainRequest, ExplainResult, QuizResult } from "@/types/intelligence";
import { getAnalysis, getDocument } from "@/lib/storage/document-store";
import { IntelligenceError } from "./errors";

const quizSchema = z.object({
  questions: z
    .array(
      z.object({
        id: z.string(),
        prompt: z.string(),
        choices: z.array(z.string()).min(2).max(5),
        correctAnswer: z.string(),
        explanation: z.string(),
      }),
    )
    .min(1)
    .max(5),
});

interface QuizKey {
  correctAnswer: string;
  explanation: string;
}
const quizKeys = new Map<string, Map<string, QuizKey>>();

export async function explainConcept(request: ExplainRequest): Promise<ExplainResult> {
  const document = getDocument(request.documentId);
  const analysis = getAnalysis(request.documentId);
  if (!document || !analysis)
    throw new IntelligenceError(
      "DOCUMENT_NOT_FOUND",
      "Analyze the document before opening the tutor.",
    );
  const concept = analysis.graph.concepts.find((item) => item.id === request.conceptId);
  if (!concept)
    throw new IntelligenceError("CONCEPT_NOT_FOUND", "That concept is not part of this document.");
  const context = concept.sourceReferences
    .map(
      (reference) => document.pages.find((page) => page.pageNumber === reference.pageNumber)?.text,
    )
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 18_000);
  const prompt = `Explain “${concept.name}” in a ${request.style} style. ${request.question ? `Answer this follow-up: ${request.question}` : ""}\nUse this document context and be explicit when adding outside background knowledge:\n${context}`;
  return {
    explanation: await generateText(prompt, 2_000),
    sourceReferences: concept.sourceReferences,
  };
}

export async function createQuiz(documentId: string, conceptId: string): Promise<QuizResult> {
  const document = getDocument(documentId);
  const analysis = getAnalysis(documentId);
  if (!document || !analysis)
    throw new IntelligenceError(
      "DOCUMENT_NOT_FOUND",
      "Analyze the document before creating a quiz.",
    );
  const concept = analysis.graph.concepts.find((item) => item.id === conceptId);
  if (!concept)
    throw new IntelligenceError("CONCEPT_NOT_FOUND", "That concept is not part of this document.");
  const raw = await generateText(
    `Create 3 short multiple-choice comprehension questions for ${concept.name}. Return JSON with questions containing id, prompt, choices, correctAnswer (exactly one choice), and explanation. Context: ${concept.description}`,
    3_000,
    true,
  );
  const parsed = quizSchema.parse(
    JSON.parse(raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")),
  );
  quizKeys.set(
    `${documentId}:${conceptId}`,
    new Map(
      parsed.questions.map((question) => [
        question.id,
        { correctAnswer: question.correctAnswer, explanation: question.explanation },
      ]),
    ),
  );
  return {
    conceptId,
    questions: parsed.questions.map((question) => ({
      id: question.id,
      prompt: question.prompt,
      choices: question.choices,
    })),
  };
}

export function evaluateQuiz(
  documentId: string,
  conceptId: string,
  answers: Record<string, string>,
) {
  const key = quizKeys.get(`${documentId}:${conceptId}`);
  if (!key)
    throw new IntelligenceError(
      "CONCEPT_NOT_FOUND",
      "Create a fresh quiz before submitting answers.",
    );
  let correct = 0;
  const feedback: string[] = [];
  for (const [id, expected] of key) {
    if (answers[id] === expected.correctAnswer) correct += 1;
    else feedback.push(expected.explanation);
  }
  const score = key.size ? Math.round((correct / key.size) * 100) : 0;
  return {
    score,
    passed: score >= 70,
    feedback: feedback.length ? feedback.join(" ") : "Excellent—each answer was correct.",
    mastery: score >= 70 ? ("mastered" as const) : ("learning" as const),
  };
}

async function generateText(
  prompt: string,
  maxOutputTokens: number,
  json = false,
): Promise<string> {
  if (!process.env.GEMINI_API_KEY)
    throw new IntelligenceError("AI_NOT_CONFIGURED", "Gemini is not configured on the server.");
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const response = await ai.models.generateContent({
    model: process.env.GEMINI_MODEL ?? "gemini-flash-latest",
    contents: prompt,
    config: {
      maxOutputTokens,
      temperature: 0.3,
      ...(json ? { responseMimeType: "application/json" } : {}),
    },
  });
  if (!response.text)
    throw new IntelligenceError("PROVIDER_ERROR", "Gemini returned an empty response.");
  return response.text;
}
