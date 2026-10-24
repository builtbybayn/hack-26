import "server-only";

import { createHash } from "node:crypto";
import type { ParseOptions } from "@/types/intelligence";
import type { ExtractionQuality, ParsedDocument } from "@/types/ingestion";
import { IntelligenceError } from "@/lib/intelligence/errors";
import { ingest } from "./index";
import { MistralOcrParser } from "./ocr/mistral";
import { MathpixParser } from "./ocr/mathpix";

export async function parseDocumentFile(
  file: File,
  options: ParseOptions,
  signal?: AbortSignal,
): Promise<{ document: ParsedDocument }> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const id = createHash("sha256").update(bytes).digest("hex");

  const standard = await ingest({ fileName: file.name, mimeType: file.type, bytes });
  if (standard.format !== "pdf" || options.mode === "standard") {
    return { document: standard };
  }

  const shouldUseOcr = shouldUseAdvancedOcr(options.mode, standard.extractionQuality);
  if (!shouldUseOcr || !options.allowExternalProcessing) {
    if (options.mode === "advanced") {
      throw new IntelligenceError(
        "CONSENT_REQUIRED",
        "Advanced OCR sends this PDF to the selected external provider. Confirm consent to continue.",
      );
    }
    return { document: standard };
  }

  const parser = options.ocrProvider === "mathpix" ? new MathpixParser() : new MistralOcrParser();
  const document = await parser.parse(
    { bytes, fileName: file.name, mimeType: file.type, documentId: id },
    { signal, timeoutMs: 90_000 },
  );
  return { document };
}

export function shouldUseAdvancedOcr(
  mode: ParseOptions["mode"],
  quality?: ExtractionQuality,
): boolean {
  return mode === "advanced" || (mode !== "standard" && quality?.needsOcr === true);
}
