import { describe, expect, it } from "vitest";
import type { QuizResult } from "@/types/intelligence";
import { evaluateQuiz } from "./tutor";

const quiz: QuizResult = {
  conceptId: "divergence",
  questions: [
    { id: "q1", prompt: "?", choices: ["a", "b"], correctAnswer: "a", explanation: "Because a." },
    { id: "q2", prompt: "?", choices: ["a", "b"], correctAnswer: "b", explanation: "Because b." },
  ],
};

describe("evaluateQuiz", () => {
  it("scores from the quiz's own answer key without server state", () => {
    expect(evaluateQuiz(quiz, { q1: "a", q2: "b" })).toMatchObject({
      score: 100,
      passed: true,
      mastery: "mastered",
    });
  });

  it("returns explanations for missed questions", () => {
    expect(evaluateQuiz(quiz, { q1: "a", q2: "a" })).toEqual({
      score: 50,
      passed: false,
      feedback: "Because b.",
      mastery: "learning",
    });
  });
});
