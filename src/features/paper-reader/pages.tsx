"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import type { ParsedPage } from "@/types/ingestion";
import type { Rotation } from "./geometry";
import { loadPdfJs } from "./pdf";

/** One PDF page: the rendered canvas and PDF.js's transparent, selectable text layer. */
export function PdfPageCanvas({
  pdf,
  pageNumber,
  scale,
  rotation,
}: {
  pdf: PDFDocumentProxy;
  pageNumber: number;
  scale: number;
  rotation: Rotation;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    let renderTask: RenderTask | null = null;
    let textLayer: { cancel(): void } | null = null;

    void (async () => {
      const [{ TextLayer }, page] = await Promise.all([loadPdfJs(), pdf.getPage(pageNumber)]);
      const canvas = canvasRef.current;
      const textContainer = textRef.current;
      if (cancelled || !canvas || !textContainer) return;

      const viewport = page.getViewport({ scale, rotation: (page.rotate + rotation) % 360 });
      const ratio = window.devicePixelRatio || 1;
      canvas.width = Math.floor(viewport.width * ratio);
      canvas.height = Math.floor(viewport.height * ratio);
      renderTask = page.render({
        canvas,
        viewport,
        transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0],
      });

      textContainer.replaceChildren();
      const layer = new TextLayer({
        textContentSource: page.streamTextContent(),
        container: textContainer,
        viewport,
      });
      textLayer = layer;
      await Promise.all([renderTask.promise, layer.render()]).catch(() => {});
    })();

    return () => {
      cancelled = true;
      renderTask?.cancel();
      textLayer?.cancel();
    };
  }, [pdf, pageNumber, scale, rotation]);

  return (
    <>
      <canvas ref={canvasRef} className="pdf-canvas" aria-hidden />
      <div ref={textRef} className="textLayer" />
    </>
  );
}

/** A small, lazily rendered page image for the thumbnail strip. */
export function PdfThumbnail({
  pdf,
  pageNumber,
  width,
}: {
  pdf: PDFDocumentProxy;
  pageNumber: number;
  width: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let task: RenderTask | null = null;
    let cancelled = false;
    void pdf.getPage(pageNumber).then((page) => {
      const canvas = canvasRef.current;
      if (cancelled || !canvas) return;
      const base = page.getViewport({ scale: 1 });
      const ratio = window.devicePixelRatio || 1;
      const viewport = page.getViewport({ scale: (width / base.width) * ratio });
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      task = page.render({ canvas, viewport });
      task.promise.catch(() => {});
    });
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [pdf, pageNumber, width]);

  return <canvas ref={canvasRef} className="pdf-thumb-canvas" aria-hidden />;
}

/** Width of a text page at 100% zoom, in CSS pixels (like a US Letter page at 96 dpi). */
export const TEXT_PAGE_WIDTH = 816;

/**
 * A paper saved from a web page (no PDF): its text laid out on a fixed-width sheet, scaled for
 * zoom, so highlight positions stay stable at every zoom level.
 */
export function TextSheet({
  page,
  scale,
  onMeasure,
}: {
  page: ParsedPage;
  scale: number;
  onMeasure: (pageNumber: number, height: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const report = () => onMeasure(page.pageNumber, element.offsetHeight);
    report();
    const observer = new ResizeObserver(report);
    observer.observe(element);
    return () => observer.disconnect();
  }, [page.pageNumber, onMeasure]);

  return (
    <div
      ref={ref}
      className="text-sheet"
      style={{ width: TEXT_PAGE_WIDTH, transform: `scale(${scale})` }}
    >
      {page.text
        .split(/\n{2,}/)
        .map((paragraph) => paragraph.trim())
        .filter(Boolean)
        .map((paragraph, index) =>
          /^#{1,6}\s/.test(paragraph) ? (
            <h2 key={index}>{paragraph.replace(/^#{1,6}\s+/, "")}</h2>
          ) : (
            <p key={index}>{paragraph}</p>
          ),
        )}
    </div>
  );
}
