import { expect, it } from "vitest";
import { POST } from "./route";

it("rejects a revised brief claim with a fabricated citation", async () => {
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
  const finding = {
    kind: "agreement",
    theme: "Accuracy",
    summary: "Both papers report improved accuracy.",
    evidence: [
      { documentId: "a", pageNumber: 1, quote: "Accuracy improved in adults." },
      { documentId: "b", pageNumber: 2, quote: "Fabricated improvement in children." },
    ],
  };
  const response = await POST(
    new Request("http://localhost/api/brief/check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ documents, finding }),
    }),
  );
  expect(response.status).toBe(400);
  expect(await response.json()).toMatchObject({
    ok: false,
    error: { code: "INVALID_REQUEST" },
  });
});
