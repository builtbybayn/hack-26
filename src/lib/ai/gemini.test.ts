import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { generateJson, generateText } from "./gemini";

const generateContent = vi.hoisted(() => vi.fn());

vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = { generateContent };
  },
}));

const previousKey = process.env.GEMINI_API_KEY;

beforeEach(() => {
  process.env.GEMINI_API_KEY = "test-key";
  generateContent.mockReset();
});

afterEach(() => {
  if (previousKey === undefined) delete process.env.GEMINI_API_KEY;
  else process.env.GEMINI_API_KEY = previousKey;
});

describe("shared Gemini calls", () => {
  it("fails before calling the provider when the key is absent", async () => {
    delete process.env.GEMINI_API_KEY;
    await expect(generateText("prompt")).rejects.toMatchObject({ code: "AI_NOT_CONFIGURED" });
    expect(generateContent).not.toHaveBeenCalled();
  });

  it("retries malformed JSON and validates the result", async () => {
    generateContent
      .mockResolvedValueOnce({ text: "not JSON" })
      .mockResolvedValueOnce({ text: '{"count":2}' });

    await expect(generateJson("prompt", z.object({ count: z.number() }))).resolves.toEqual({
      count: 2,
    });
    expect(generateContent).toHaveBeenCalledTimes(2);
    expect(generateContent.mock.calls[0][0].config.responseMimeType).toBe("application/json");
  });

  it("does not retry provider failures", async () => {
    generateContent.mockRejectedValue(new Error("provider unavailable"));
    await expect(generateJson("prompt", z.object({ count: z.number() }))).rejects.toMatchObject({
      code: "PROVIDER_ERROR",
    });
    expect(generateContent).toHaveBeenCalledTimes(1);
  });
});
