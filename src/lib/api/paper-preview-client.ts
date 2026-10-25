import type { PdfStudyPreviewResponse } from "@/types/paper-preview";

export async function requestPdfStudyPreview(
  file: File,
  signal?: AbortSignal,
): Promise<PdfStudyPreviewResponse> {
  const body = new FormData();
  body.append("file", file);
  try {
    const response = await fetch("/api/papers/preview", { method: "POST", body, signal });
    return (await response.json()) as PdfStudyPreviewResponse;
  } catch (error) {
    if (signal?.aborted) throw error;
    return { ok: false, error: { code: "NETWORK_ERROR", message: "Could not analyze the PDF." } };
  }
}
