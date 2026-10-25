import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { generateJson, generateText, isTransientGeminiError } from "./gemini";

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

  it("retries an overloaded model, then falls back to another model", async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const overloaded = Object.assign(new Error("This model is experiencing high demand"), {
      status: 503,
    });
    generateContent
      .mockRejectedValueOnce(overloaded)
      .mockRejectedValueOnce(overloaded)
      .mockResolvedValueOnce({ text: "ok" });
    const result = generateText("prompt");
    await vi.runAllTimersAsync();
    await expect(result).resolves.toBe("ok");
    expect(generateContent.mock.calls.map((call) => call[0].model)).toEqual([
      "gemini-3.5-flash",
      "gemini-3.5-flash",
      "gemini-2.5-flash",
    ]);
    vi.useRealTimers();
  });

  it("says the model is busy when every attempt is overloaded", async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "error").mockImplementation(() => {});
    generateContent.mockRejectedValue(Object.assign(new Error("UNAVAILABLE"), { status: 503 }));
    const result = generateText("prompt");
    const assertion = expect(result).rejects.toMatchObject({
      code: "PROVIDER_ERROR",
      message: "Gemini is busy right now. Please try again in a minute.",
    });
    await vi.runAllTimersAsync();
    await assertion;
    expect(generateContent).toHaveBeenCalledTimes(4);
    vi.useRealTimers();
  });
});

describe("isTransientGeminiError", () => {
  it("recognizes overload, rate limits, and internal errors only", () => {
    expect(isTransientGeminiError({ status: 503 })).toBe(true);
    expect(isTransientGeminiError({ status: 429 })).toBe(true);
    expect(isTransientGeminiError({ status: 400 })).toBe(false);
    expect(isTransientGeminiError(new Error('{"error":{"code":503,"status":"UNAVAILABLE"}}'))).toBe(
      true,
    );
    expect(isTransientGeminiError(new Error("API key not valid"))).toBe(false);
  });
});
