import "server-only";

import { generateText } from "@/lib/ai/gemini";
import { z } from "zod";
import type {
  Concept,
  EvaluateResult,
  ExplainRequest,
  ExplainResult,
  QuizResult,
} from "@/types/intelligence";
import { quizQuestionSchema } from "./schema";

const modelQuizSchema = z.object({ questions: z.array(quizQuestionSchema).min(1).max(5) });

export async function explainConcept(request: ExplainRequest): Promise<ExplainResult> {
  const { document, concept } = request;
  const context = concept.sourceReferences
    .map(
      (reference) => document.pages.find((page) => page.pageNumber === reference.pageNumber)?.text,
    )
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 18_000);
  const prompt = `Explain “${concept.name}” in a ${request.style} style. ${request.question ? `Answer this follow-up: ${request.question}` : ""}\nUse this document context and be explicit when adding outside background knowledge:\n${context}`;
  return {
    explanation: await generateText(prompt, { maxOutputTokens: 2_000, temperature: 0.3 }),
    sourceReferences: concept.sourceReferences,
  };
}

export async function createQuiz(concept: Concept): Promise<QuizResult> {
  const raw = await generateText(
    `Create 3 short multiple-choice comprehension questions for ${concept.name}. Return JSON with questions containing id, prompt, choices, correctAnswer (exactly one choice), and explanation. Context: ${concept.description}`,
    { maxOutputTokens: 3_000, temperature: 0.3, json: true },
  );
  const parsed = modelQuizSchema.parse(
    JSON.parse(raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")),
  );
  return { conceptId: concept.id, questions: parsed.questions };
}

/** Pure scoring: the quiz carries its own answer key, so no server state is needed. */
export function evaluateQuiz(quiz: QuizResult, answers: Record<string, string>): EvaluateResult {
  let correct = 0;
  const feedback: string[] = [];
  for (const question of quiz.questions) {
    if (answers[question.id] === question.correctAnswer) correct += 1;
    else feedback.push(question.explanation);
  }
  const score = quiz.questions.length ? Math.round((correct / quiz.questions.length) * 100) : 0;
  return {
    score,
    passed: score >= 70,
    feedback: feedback.length ? feedback.join(" ") : "Excellent—each answer was correct.",
    mastery: score >= 70 ? "mastered" : "learning",
  };
}
