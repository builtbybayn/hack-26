import { expect, it } from "vitest";
import { POST } from "./route";

it("rejects saved findings whose quotes no longer match supplied pages", async () => {
  const documents = [
    {
      id: "a",
      title: null,
      source: { fileName: "a.pdf" },
      pages: [{ pageNumber: 1, text: "Accuracy improved in adults." }],
      sections: [],
    },
    {
      id: "b",
      title: null,
      source: { fileName: "b.pdf" },
      pages: [{ pageNumber: 2, text: "Accuracy improved in children." }],
      sections: [],
    },
  ];
  const findings = [
    {
      kind: "agreement",
      theme: "Accuracy",
      summary: "Both papers improved.",
      evidence: [
        { documentId: "a", pageNumber: 1, quote: "Accuracy improved in adults." },
        { documentId: "b", pageNumber: 2, quote: "Invented claim in children." },
      ],
    },
  ];
  const response = await POST(
    new Request("http://localhost/api/synthesis/check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ documents, findings }),
    }),
  );
  expect(response.status).toBe(400);
  expect(await response.json()).toMatchObject({ ok: false, error: { code: "INVALID_REQUEST" } });
});
