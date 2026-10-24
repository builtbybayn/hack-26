import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { generateJson, isGrokConfigured } from "./grok";

const previousKey = process.env.XAI_API_KEY;

afterEach(() => {
  if (previousKey === undefined) delete process.env.XAI_API_KEY;
  else process.env.XAI_API_KEY = previousKey;
  vi.unstubAllGlobals();
});

describe("Grok adapter", () => {
  it("fails without a key before making a request", async () => {
    delete process.env.XAI_API_KEY;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(isGrokConfigured()).toBe(false);
    await expect(generateJson("prompt", z.object({ verdict: z.string() }))).rejects.toMatchObject({
      code: "AI_NOT_CONFIGURED",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses the Responses API and validates structured output", async () => {
    process.env.XAI_API_KEY = "test-key";
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          output: [{ content: [{ type: "output_text", text: '{"verdict":"unclear"}' }] }],
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      generateJson("prompt", z.object({ verdict: z.enum(["unclear", "contradiction"]) })),
    ).resolves.toEqual({ verdict: "unclear" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.x.ai/v1/responses");
    expect(JSON.parse(init.body).text.format.type).toBe("json_schema");
  });
});
