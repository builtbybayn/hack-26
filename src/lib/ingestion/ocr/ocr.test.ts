import { afterEach, describe, expect, it, vi } from "vitest";
import { MathpixParser } from "./mathpix";
import { MistralOcrParser } from "./mistral";

const input = {
  bytes: new TextEncoder().encode("%PDF fixture"),
  fileName: "stem.pdf",
  mimeType: "application/pdf",
  documentId: "fixture",
};

describe("OCR adapters", () => {
  afterEach(() => {
    delete process.env.MISTRAL_API_KEY;
    delete process.env.MATHPIX_APP_ID;
    delete process.env.MATHPIX_APP_KEY;
  });

  it("normalizes a mocked Mistral response with equations and tables", async () => {
    process.env.MISTRAL_API_KEY = "test";
    const fetcher = vi.fn(async () =>
      Response.json({
        pages: [
          {
            index: 0,
            markdown: "# Maxwell\n$$\\nabla \\cdot E = \\rho/\\epsilon$$",
            tables: [{ markdown: "| law | form |" }],
          },
        ],
      }),
    );
    const result = await new MistralOcrParser(fetcher as typeof fetch).parse(input);
    expect(result.provenance.parser).toBe("mistral");
    expect(result.pages[0].equations).toHaveLength(1);
    expect(result.pages[0].tables?.[0].markdown).toContain("law");
  });

  it("polls and normalizes a mocked Mathpix response", async () => {
    process.env.MATHPIX_APP_ID = "id";
    process.env.MATHPIX_APP_KEY = "key";
    const responses = [
      Response.json({ pdf_id: "job" }),
      Response.json({ status: "completed" }),
      new Response("# Optics\n$E=mc^2$"),
    ];
    const fetcher = vi.fn(async () => responses.shift()!);
    const result = await new MathpixParser(fetcher as typeof fetch, 0).parse(input);
    expect(result.provenance.parser).toBe("mathpix");
    expect(result.pages[0].equations).toEqual(["E=mc^2"]);
  });
});
