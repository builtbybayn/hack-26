import { afterEach, describe, expect, it } from "vitest";
import { POST } from "./route";

const paper = (id: string) => ({
  id,
  title: id,
  source: { fileName: `${id}.pdf` },
  pages: [{ pageNumber: 1, text: "A result was measured." }],
  sections: [{ heading: null, text: "A result was measured." }],
});
const post = (body: unknown) =>
  POST(
    new Request("http://localhost/api/contradictions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

describe("POST /api/contradictions", () => {
  const previousKey = process.env.GEMINI_API_KEY;
  afterEach(() => {
    if (previousKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previousKey;
  });

  it("rejects duplicate document IDs", async () => {
    const response = await post({ documents: [paper("same"), paper("same")] });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ ok: false, error: { code: "INVALID_REQUEST" } });
  });

  it("reports a missing Gemini key without making a model call", async () => {
    delete process.env.GEMINI_API_KEY;
    const response = await post({ documents: [paper("one"), paper("two")] });
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      ok: false,
      error: { code: "AI_NOT_CONFIGURED" },
    });
  });
});
