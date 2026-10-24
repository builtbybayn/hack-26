import "server-only";

import type { DocumentParser, ParseOptions, PDFInput } from "../document-parser";
import { IntelligenceError } from "@/lib/intelligence/errors";
import { documentFromOcr, extractLatex } from "./normalize";

interface MathpixStatus {
  status?: string;
  error?: string;
}

export class MathpixParser implements DocumentParser {
  constructor(
    private readonly fetcher: typeof fetch = fetch,
    private readonly pollIntervalMs = 1_500,
  ) {}

  async parse(input: PDFInput, options: ParseOptions = {}) {
    const appId = process.env.MATHPIX_APP_ID;
    const appKey = process.env.MATHPIX_APP_KEY;
    if (!appId || !appKey)
      throw new IntelligenceError("OCR_NOT_CONFIGURED", "Mathpix is not configured on the server.");
    const headers = { app_id: appId, app_key: appKey };
    const form = new FormData();
    form.append(
      "file",
      new Blob([input.bytes.slice()], { type: "application/pdf" }),
      input.fileName,
    );
    form.append(
      "options_json",
      JSON.stringify({
        conversion_formats: { md: true },
        math_inline_delimiters: ["$", "$"],
        rm_spaces: true,
      }),
    );
    const submitted = await this.fetcher("https://api.mathpix.com/v3/pdf", {
      method: "POST",
      headers,
      body: form,
      signal: options.signal,
    });
    if (!submitted.ok)
      throw new IntelligenceError(
        "PROVIDER_ERROR",
        `Mathpix upload failed with HTTP ${submitted.status}.`,
      );
    const { pdf_id: pdfId } = (await submitted.json()) as { pdf_id?: string };
    if (!pdfId)
      throw new IntelligenceError("PROVIDER_ERROR", "Mathpix did not return a job identifier.");

    const timeoutAt = Date.now() + (options.timeoutMs ?? 90_000);
    while (Date.now() < timeoutAt) {
      await abortableDelay(this.pollIntervalMs, options.signal);
      const statusResponse = await this.fetcher(
        `https://api.mathpix.com/v3/pdf/${encodeURIComponent(pdfId)}`,
        { headers, signal: options.signal },
      );
      const status = (await statusResponse.json()) as MathpixStatus;
      if (status.status === "error")
        throw new IntelligenceError("PROVIDER_ERROR", status.error ?? "Mathpix OCR failed.");
      if (status.status === "completed") {
        const markdownResponse = await this.fetcher(
          `https://api.mathpix.com/v3/pdf/${encodeURIComponent(pdfId)}.md`,
          { headers, signal: options.signal },
        );
        if (!markdownResponse.ok)
          throw new IntelligenceError(
            "PROVIDER_ERROR",
            "Mathpix could not return the parsed document.",
          );
        const markdown = await markdownResponse.text();
        const pageChunks = markdown.split(/\n-{3,}\s*Page\s+\d+\s*-{3,}\n/i);
        const pages = pageChunks
          .filter((chunk) => chunk.trim())
          .map((chunk, index) => ({
            pageNumber: index + 1,
            text: chunk.replace(/^#{1,6}\s+/gm, ""),
            markdown: chunk,
            equations: extractLatex(chunk),
          }));
        return documentFromOcr(
          input,
          "mathpix",
          pages.length
            ? pages
            : [{ pageNumber: 1, text: markdown, markdown, equations: extractLatex(markdown) }],
        );
      }
    }
    throw new IntelligenceError(
      "REQUEST_TIMEOUT",
      "Mathpix OCR timed out before processing completed.",
    );
  }
}

function abortableDelay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new DOMException("The operation was aborted.", "AbortError"));
      },
      { once: true },
    );
  });
}
