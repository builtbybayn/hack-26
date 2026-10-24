import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { POST } from "./route";

const post = (body: unknown) =>
  POST(
    new Request("http://localhost/api/documents/analyze", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

const document = {
  id: "hash",
  title: null,
  source: { fileName: "notes.txt" },
  pages: [{ pageNumber: 1, text: "Divergence measures outflow." }],
  sections: [{ heading: null, text: "Divergence measures outflow." }],
};

describe("POST /api/documents/analyze", () => {
  const savedKey = process.env.GEMINI_API_KEY;
  beforeEach(() => delete process.env.GEMINI_API_KEY);
  afterEach(() => {
    if (savedKey !== undefined) process.env.GEMINI_API_KEY = savedKey;
  });

  it("validates the request body", async () => {
    const response = await post({ mastery: "invalid" });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ ok: false, error: { code: "INVALID_REQUEST" } });
  });

  it("accepts the document in the body instead of looking it up on the server", async () => {
    const response = await post({ document });
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      ok: false,
      error: { code: "AI_NOT_CONFIGURED" },
    });
  });
});
