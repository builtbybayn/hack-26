import "server-only";

import { createHash } from "node:crypto";
import type { ParseOptions } from "@/types/intelligence";
import type { ExtractionQuality, ParsedDocument } from "@/types/ingestion";
import { getDocument, putDocument } from "@/lib/storage/document-store";
import { IntelligenceError } from "@/lib/intelligence/errors";
import { ingest } from "./index";
import { MistralOcrParser } from "./ocr/mistral";
import { MathpixParser } from "./ocr/mathpix";

export async function parseDocumentFile(
  file: File,
  options: ParseOptions,
  signal?: AbortSignal,
): Promise<{ document: ParsedDocument; cacheHit: boolean }> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const id = createHash("sha256").update(bytes).digest("hex");
  const cached = getDocument(id);
  if (cached && (options.mode !== "advanced" || cached.provenance.externalProcessing)) {
    return { document: cached, cacheHit: true };
  }

  const standard = await ingest({ fileName: file.name, mimeType: file.type, bytes });
  if (standard.format !== "pdf" || options.mode === "standard") {
    putDocument(standard);
    return { document: standard, cacheHit: false };
  }

  const shouldUseOcr = shouldUseAdvancedOcr(options.mode, standard.extractionQuality);
  if (!shouldUseOcr || !options.allowExternalProcessing) {
    if (options.mode === "advanced") {
      throw new IntelligenceError(
        "CONSENT_REQUIRED",
        "Advanced OCR sends this PDF to the selected external provider. Confirm consent to continue.",
      );
    }
    putDocument(standard);
    return { document: standard, cacheHit: false };
  }

  const parser = options.ocrProvider === "mathpix" ? new MathpixParser() : new MistralOcrParser();
  const document = await parser.parse(
    { bytes, fileName: file.name, mimeType: file.type, documentId: id },
    { signal, timeoutMs: 90_000 },
  );
  putDocument(document);
  return { document, cacheHit: false };
}

export function shouldUseAdvancedOcr(
  mode: ParseOptions["mode"],
  quality?: ExtractionQuality,
): boolean {
  return mode === "advanced" || (mode !== "standard" && quality?.needsOcr === true);
}
