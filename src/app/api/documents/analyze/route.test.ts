import { describe, expect, it } from "vitest";
import { POST } from "./route";

describe("POST /api/documents/analyze", () => {
  it("validates the request body", async () => {
    const response = await POST(
      new Request("http://localhost/api/documents/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mastery: "invalid" }),
      }),
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ ok: false, error: { code: "INVALID_REQUEST" } });
  });
});
