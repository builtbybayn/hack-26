import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  generateLuminalText,
  isTransientLuminalError,
  LuminalHttpError,
  stripReasoning,
} from "./luminal";

const fetchMock = vi.fn();
const reply = (content: string) =>
  new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });
const failure = (status: number) => new Response("nope", { status });

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  process.env.LUMINAL_API_KEY = "test-key";
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  delete process.env.LUMINAL_API_KEY;
});

describe("generateLuminalText", () => {
  it("calls the OpenAI-compatible endpoint with the key, model, and JSON mode", async () => {
    fetchMock.mockResolvedValue(reply('{"ok":true}'));
    await expect(generateLuminalText("prompt", { json: true, maxOutputTokens: 100 })).resolves.toBe(
      '{"ok":true}',
    );
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://flash.luminal.cloud/v1/chat/completions");
    expect(init.headers.Authorization).toBe("Bearer test-key");
    expect(JSON.parse(init.body)).toEqual({
      model: "deepseek-ai/DeepSeek-V4.1-Flash",
      messages: [{ role: "user", content: "prompt" }],
      max_tokens: 100,
      response_format: { type: "json_object" },
    });
  });

  it("puts a JSON Schema into the prompt, since the API doesn't enforce it", async () => {
    fetchMock.mockResolvedValue(reply("{}"));
    await generateLuminalText("prompt", { jsonSchema: { type: "object" } });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.messages[0].content).toContain('matches this JSON Schema:\n{"type":"object"}');
  });

  it("retries rate limits and server errors, then succeeds", async () => {
    vi.useFakeTimers();
    fetchMock
      .mockResolvedValueOnce(failure(429))
      .mockResolvedValueOnce(failure(503))
      .mockResolvedValueOnce(reply("ok"));
    const result = generateLuminalText("prompt");
    await vi.runAllTimersAsync();
    await expect(result).resolves.toBe("ok");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("reports a rejected key without retrying", async () => {
    fetchMock.mockResolvedValue(failure(401));
    await expect(generateLuminalText("prompt")).rejects.toMatchObject({
      code: "PROVIDER_ERROR",
      message: "Luminal rejected the API key.",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("drops response_format when the server rejects it", async () => {
    fetchMock.mockResolvedValueOnce(failure(400)).mockResolvedValueOnce(reply("{}"));
    await generateLuminalText("prompt", { json: true });
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).response_format).toBeUndefined();
  });

  it("needs a key", async () => {
    delete process.env.LUMINAL_API_KEY;
    await expect(generateLuminalText("prompt")).rejects.toMatchObject({
      code: "AI_NOT_CONFIGURED",
    });
  });
});

describe("helpers", () => {
  it("strips reasoning and recognizes transient errors", () => {
    expect(stripReasoning('<think>hmm</think>\n{"a":1}')).toBe('{"a":1}');
    expect(isTransientLuminalError(new LuminalHttpError(429, "x"))).toBe(true);
    expect(isTransientLuminalError(new LuminalHttpError(500, "x"))).toBe(true);
    expect(isTransientLuminalError(new LuminalHttpError(400, "x"))).toBe(false);
    expect(isTransientLuminalError(new TypeError("fetch failed"))).toBe(true);
  });
});
