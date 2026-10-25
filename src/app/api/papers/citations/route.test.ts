import { afterEach, expect, it, vi } from "vitest";
import { POST } from "./route";

afterEach(() => vi.unstubAllGlobals());

it("rejects invalid or duplicate provider IDs", async () => {
  for (const paperIds of [["https://other.example/W1"], ["openalex:W1", "openalex:W1"]]) {
    const response = await POST(
      new Request("http://localhost/api/papers/citations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paperIds }),
      }),
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ ok: false, error: { code: "INVALID_REQUEST" } });
  }
});

it("returns OpenAlex references in the API response envelope", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      Response.json({
        results: [{ id: "https://openalex.org/W1", referenced_works: ["https://openalex.org/W2"] }],
      }),
    ),
  );
  const response = await POST(
    new Request("http://localhost/api/papers/citations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paperIds: ["openalex:W1"] }),
    }),
  );
  expect(await response.json()).toEqual({
    ok: true,
    data: { references: { "openalex:W1": ["openalex:W2"] } },
  });
});
