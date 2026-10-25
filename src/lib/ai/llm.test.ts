import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { IntelligenceError } from "@/lib/intelligence/errors";
import { generateJson, generateText, stripCodeFence } from "./llm";

const luminal = vi.hoisted(() => vi.fn());
const gemini = vi.hoisted(() => vi.fn());
vi.mock("./luminal", () => ({
  generateLuminalText: luminal,
  isLuminalConfigured: () => Boolean(process.env.LUMINAL_API_KEY),
}));
vi.mock("./gemini", () => ({ generateText: gemini }));

const busy = () => new IntelligenceError("PROVIDER_ERROR", "busy");

beforeEach(() => {
  luminal.mockReset();
  gemini.mockReset();
  process.env.LUMINAL_API_KEY = "l";
  process.env.GEMINI_API_KEY = "g";
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  delete process.env.LUMINAL_API_KEY;
  delete process.env.GEMINI_API_KEY;
});

describe("generateText", () => {
  it("uses Luminal first", async () => {
    luminal.mockResolvedValue("from luminal");
    await expect(generateText("p")).resolves.toBe("from luminal");
    expect(gemini).not.toHaveBeenCalled();
  });

  it("falls back to Gemini when Luminal is busy", async () => {
    luminal.mockRejectedValue(busy());
    gemini.mockResolvedValue("from gemini");
    await expect(generateText("p")).resolves.toBe("from gemini");
  });

  it("uses Gemini alone without a Luminal key", async () => {
    delete process.env.LUMINAL_API_KEY;
    gemini.mockResolvedValue("from gemini");
    await expect(generateText("p")).resolves.toBe("from gemini");
    expect(luminal).not.toHaveBeenCalled();
  });

  it("reports no configured provider", async () => {
    delete process.env.LUMINAL_API_KEY;
    delete process.env.GEMINI_API_KEY;
    await expect(generateText("p")).rejects.toMatchObject({ code: "AI_NOT_CONFIGURED" });
  });
});

describe("generateJson", () => {
  it("retries output that isn't valid JSON, then validates", async () => {
    luminal
      .mockResolvedValueOnce("Sure! Here you go")
      .mockResolvedValueOnce('```json\n{"n":2}\n```');
    await expect(generateJson("p", z.object({ n: z.number() }))).resolves.toEqual({ n: 2 });
  });

  it("finds the JSON inside surrounding text", () => {
    expect(stripCodeFence('Here it is: {"a":1} hope that helps')).toBe('{"a":1}');
  });
});
