import { describe, expect, it } from "vitest";
import type { ExplainRequest, QuizResult } from "@/types/intelligence";
import { quoteAppearsOnPage } from "./source-evidence";
import { evaluateQuiz, explainConcept } from "./tutor";

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

const request = {
  document: {
    pages: [{ pageNumber: 2, text: "The measured field\n increased with temperature." }],
  },
  concept: { name: "field", sourceReferences: [{ pageNumber: 2 }] },
  style: "technical",
} as ExplainRequest;

describe("source-linked explanations", () => {
  it("accepts a quote on the cited page despite whitespace differences", async () => {
    let calls = 0;
    const result = await explainConcept(request, async () =>
      ++calls === 1
        ? JSON.stringify({
            sections: [
              {
                text: "The measured field increased.",
                pageNumber: 2,
                quote: "field increased with temperature",
              },
              { text: "Background: other factors may matter.", pageNumber: null, quote: null },
            ],
          })
        : JSON.stringify({
            checks: [
              { index: 0, verdict: "supported", reason: "The passage reports the increase." },
            ],
          }),
    );
    expect(result.sections[0].sourceReference).toEqual({
      pageNumber: 2,
      quote: "field increased with temperature",
    });
    expect(result.sections[1].sourceReference).toBeNull();
    expect(result.sections[0].evidence).toEqual({
      verdict: "supported",
      reason: "The passage reports the increase.",
    });
    expect(result.sections[1].evidence).toBeNull();
    expect(calls).toBe(2);
    expect(
      quoteAppearsOnPage(request.document.pages[0].text, "field increased with temperature"),
    ).toBe(true);
  });

  it("shows contradictory assessments and treats incomplete checks as unclear", async () => {
    const explanation = JSON.stringify({
      sections: [
        { text: "The field decreased.", pageNumber: 2, quote: "field increased with temperature" },
      ],
    });
    const contradicted = await explainConcept(request, async (prompt) =>
      prompt.startsWith("Explain")
        ? explanation
        : JSON.stringify({
            checks: [{ index: 0, verdict: "contradicted", reason: "The passage says increased." }],
          }),
    );
    expect(contradicted.sections[0].evidence?.verdict).toBe("contradicted");

    const unchecked = await explainConcept(request, async (prompt) =>
      prompt.startsWith("Explain") ? explanation : JSON.stringify({ checks: [] }),
    );
    expect(unchecked.sections[0].evidence).toEqual({
      verdict: "unclear",
      reason: "The evidence check was unavailable.",
    });
  });

  it("rejects invented quotes and mismatched pages", async () => {
    for (const pageNumber of [2, 3]) {
      await expect(
        explainConcept(request, async () =>
          JSON.stringify({
            sections: [
              { text: "Unsupported claim", pageNumber, quote: "A passage that is not present" },
            ],
          }),
        ),
      ).rejects.toMatchObject({ code: "MODEL_RESPONSE_INVALID" });
    }
  });
});
