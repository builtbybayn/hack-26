import "server-only";

import type { ParsedPage } from "@/types/ingestion";
import type { DocumentParser, ParseOptions, PDFInput } from "../document-parser";
import { IntelligenceError } from "@/lib/intelligence/errors";
import { documentFromOcr, extractLatex } from "./normalize";

interface MistralOcrResponse {
  pages?: Array<{
    index?: number;
    markdown?: string;
    text?: string;
    tables?: Array<{ markdown?: string }>;
  }>;
}

export class MistralOcrParser implements DocumentParser {
  constructor(private readonly fetcher: typeof fetch = fetch) {}

  async parse(input: PDFInput, options: ParseOptions = {}) {
    const apiKey = process.env.MISTRAL_API_KEY;
    if (!apiKey)
      throw new IntelligenceError(
        "OCR_NOT_CONFIGURED",
        "Mistral OCR is not configured on the server.",
      );
    const response = await this.fetcher("https://api.mistral.ai/v1/ocr", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.MISTRAL_OCR_MODEL ?? "mistral-ocr-latest",
        document: {
          type: "document_url",
          document_url: `data:application/pdf;base64,${Buffer.from(input.bytes).toString("base64")}`,
        },
        include_image_base64: false,
      }),
      signal: options.signal,
    });
    if (!response.ok)
      throw new IntelligenceError(
        "PROVIDER_ERROR",
        `Mistral OCR failed with HTTP ${response.status}.`,
      );
    const payload = (await response.json()) as MistralOcrResponse;
    if (!payload.pages?.length)
      throw new IntelligenceError("PROVIDER_ERROR", "Mistral OCR returned no pages.");
    const pages: ParsedPage[] = payload.pages.map((page, index) => {
      const markdown = page.markdown ?? page.text ?? "";
      return {
        pageNumber: (page.index ?? index) + 1,
        text: markdown.replace(/^#{1,6}\s+/gm, ""),
        markdown,
        equations: extractLatex(markdown),
        tables:
          page.tables?.flatMap((table) => (table.markdown ? [{ markdown: table.markdown }] : [])) ??
          [],
      };
    });
    return documentFromOcr(input, "mistral", pages);
  }
}
