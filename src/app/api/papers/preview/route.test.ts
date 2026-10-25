import { expect, it } from "vitest";
import { POST } from "./route";

it("requires an uploaded PDF before starting analysis", async () => {
  const empty = await POST(
    new Request("http://localhost/api/papers/preview", { method: "POST", body: new FormData() }),
  );
  expect(empty.status).toBe(400);
  expect(await empty.json()).toMatchObject({ ok: false, error: { code: "NO_FILE" } });

  const form = new FormData();
  form.append("file", new File(["not a PDF"], "notes.txt", { type: "text/plain" }));
  const text = await POST(
    new Request("http://localhost/api/papers/preview", { method: "POST", body: form }),
  );
  expect(text.status).toBe(415);
  expect(await text.json()).toMatchObject({ ok: false, error: { code: "UNSUPPORTED_FORMAT" } });
});
