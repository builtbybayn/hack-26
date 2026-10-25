/**
 * PDF.js in the browser, for displaying papers. (Text extraction happens on the server through
 * `src/lib/ingestion`; this module only renders pages and their selectable text layer.)
 */
import type { PDFDocumentProxy } from "pdfjs-dist";

type PdfJs = typeof import("pdfjs-dist");

let pdfjs: Promise<PdfJs> | null = null;

/** Loads PDF.js on first use only, so it never runs during server rendering. */
export function loadPdfJs(): Promise<PdfJs> {
  pdfjs ??= import("pdfjs-dist").then((module) => {
    module.GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/build/pdf.worker.min.mjs",
      import.meta.url,
    ).toString();
    return module;
  });
  return pdfjs;
}

export async function openPdf(file: Blob): Promise<PDFDocumentProxy> {
  const { getDocument } = await loadPdfJs();
  return getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
}

/** Page sizes in PDF points at 100% zoom, unrotated (including the page's own rotation). */
export async function readPageSizes(
  pdf: PDFDocumentProxy,
): Promise<{ width: number; height: number }[]> {
  return Promise.all(
    Array.from({ length: pdf.numPages }, async (_, index) => {
      const viewport = (await pdf.getPage(index + 1)).getViewport({ scale: 1 });
      return { width: viewport.width, height: viewport.height };
    }),
  );
}
