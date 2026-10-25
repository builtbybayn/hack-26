import { afterEach, describe, expect, it } from "vitest";
import { buildChatPrompt } from "@/lib/intelligence/chat";
import { POST } from "./route";

const post = (body: unknown) =>
  POST(
    new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

describe("POST /api/chat", () => {
  const previousKey = process.env.GEMINI_API_KEY;
  afterEach(() => {
    if (previousKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previousKey;
  });

  it("requires the last message to be the user's", async () => {
    const response = await post({
      messages: [{ role: "assistant", content: "Hi" }],
      papers: [],
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ ok: false, error: { code: "INVALID_REQUEST" } });
  });

  it("reports a missing Gemini key", async () => {
    delete process.env.GEMINI_API_KEY;
    const response = await post({ messages: [{ role: "user", content: "Hi" }], papers: [] });
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      ok: false,
      error: { code: "AI_NOT_CONFIGURED" },
    });
  });
});

describe("buildChatPrompt", () => {
  const page = (pageNumber: number, length: number) => ({
    pageNumber,
    text: `${"x".repeat(length - 1)}${pageNumber}`,
  });

  it("includes the conversation, quoted passages, and paper pages", () => {
    const prompt = buildChatPrompt({
      messages: [
        {
          role: "user",
          content: "What does this mean?",
          passage: { title: "Paths", pageNumber: 2, text: "Grover training" },
        },
      ],
      papers: [{ title: "Paths", topics: ["quantum"], pages: [page(1, 20), page(2, 20)] }],
    });
    expect(prompt).toContain('[Quoting "Paths", p. 2: "Grover training"]');
    expect(prompt).toContain("Topics: quantum");
    expect(prompt).toContain("--- p. 1 ---");
    expect(prompt).toContain("--- p. 2 ---");
  });

  it("keeps quoted pages when a paper is too long, and says pages were omitted", () => {
    const pages = Array.from({ length: 10 }, (_, index) => page(index + 1, 20_000));
    const prompt = buildChatPrompt({
      messages: [
        {
          role: "user",
          content: "Explain",
          passage: { title: "Long", pageNumber: 9, text: "quote" },
        },
      ],
      papers: [{ title: "Long", pages }],
    });
    expect(prompt).toContain("--- p. 9 ---");
    expect(prompt).not.toContain("--- p. 5 ---");
    expect(prompt).toMatch(/\(\d+ page\(s\) omitted for length\.\)/);
  });
});
