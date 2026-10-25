"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import {
  GalleryVertical,
  Highlighter,
  Minus,
  Plus,
  Redo2,
  RotateCw,
  StretchHorizontal,
  Undo2,
} from "lucide-react";
import { getPaperFile, type DocumentRecord } from "@/lib/browser-store";
import type { Annotation, ChatPassage, HighlightColor, PageRect, VaultPaper } from "@/types/vault";
import { loadLocal, saveLocal } from "../use-settings";
import { newId } from "../vault-tree";
import { removeAnnotation, saveAnnotation, useAnnotations } from "./annotations-store";
import {
  layoutMargin,
  rotateRect,
  selectionToPageRects,
  unrotateRect,
  type Rotation,
} from "./geometry";
import { MarginComment } from "./MarginComment";
import { PdfPageCanvas, PdfThumbnail, TEXT_PAGE_WIDTH, TextSheet } from "./pages";
import { openPdf, readPageSizes } from "./pdf";
import { SelectionToolbar } from "./SelectionToolbar";

/** Ask the reader to show a page or an annotation (from search, chat, or the sidebar). */
export interface PaperFocus {
  documentId: string;
  pageNumber: number;
  annotationId?: string;
  nonce: number;
}

interface PaperViewProps {
  entry: VaultPaper;
  record: DocumentRecord | null;
  author: string;
  focus: PaperFocus | null;
  onAskAi: (passage: ChatPassage) => void;
}

type Source =
  | { kind: "loading" }
  | { kind: "pdf"; pdf: PDFDocumentProxy }
  | { kind: "text" }
  | { kind: "missing" };

interface Size {
  width: number;
  height: number;
}

interface PendingSelection {
  pageNumber: number;
  rects: PageRect[];
  quote: string;
  /** Toolbar anchor, relative to the reader. */
  x: number;
  y: number;
}

interface AnnotationChange {
  before: Annotation | null;
  after: Annotation | null;
}

/** Focus requests already shown, so reopening a paper later doesn't jump back to an old one. */
const shownFocus = new Set<number>();

const PAGE_GAP = 16;
const PAD_TOP = 24;
const MARGIN_WIDTH = 280;
const MIN_SCALE = 0.25;
const MAX_SCALE = 4;
const THUMB_WIDTH = 120;
/** The thumbnail strip, including its border (see .paper-thumbs). */
const THUMBS_WIDTH = 169;
const SCROLLBAR_WIDTH = 16;
const ESTIMATED_TEXT_PAGE_HEIGHT = 1056;

export function PaperView({ entry, record, author, focus, onAskAi }: PaperViewProps) {
  const documentId = entry.documentId;
  const document = record?.document ?? null;
  const [source, setSource] = useState<Source>({ kind: "loading" });
  const [baseSizes, setBaseSizes] = useState<Size[]>([]);
  const [scale, setScale] = useState<number | null>(null);
  const [rotation, setRotation] = useState<Rotation>(0);
  /** Null until toggled: then thumbnails show whenever there's room. */
  const [showThumbs, setShowThumbs] = useState<boolean | null>(null);
  const [visible, setVisible] = useState<Set<number>>(new Set([1, 2]));
  const [currentPage, setCurrentPage] = useState(1);
  const [pageInput, setPageInput] = useState("1");
  const [highlightMode, setHighlightMode] = useState(false);
  const [color, setColor] = useState<HighlightColor>("yellow");
  const [selection, setSelection] = useState<PendingSelection | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [cardHeights, setCardHeights] = useState<Record<string, number>>({});
  const [history, setHistory] = useState<{ undo: AnnotationChange[]; redo: AnnotationChange[] }>({
    undo: [],
    redo: [],
  });
  const [bodyWidth, setBodyWidth] = useState(0);
  const annotations = useAnnotations(documentId);

  const rootRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const pagesRef = useRef<HTMLDivElement>(null);

  // Load the original PDF if we have it; otherwise show the extracted text.
  const hasText = !!document;
  useEffect(() => {
    let cancelled = false;
    let loaded: PDFDocumentProxy | null = null;
    void getPaperFile(documentId)
      .then(async (file) => {
        const isPdf =
          file && (file.file.type === "application/pdf" || /\.pdf$/i.test(file.fileName));
        if (!isPdf) {
          if (!cancelled) setSource(hasText ? { kind: "text" } : { kind: "missing" });
          return;
        }
        const pdf = await openPdf(file.file);
        loaded = pdf;
        const sizes = await readPageSizes(pdf);
        if (cancelled) return;
        setBaseSizes(sizes);
        setSource({ kind: "pdf", pdf });
      })
      .catch(() => {
        if (!cancelled) setSource(hasText ? { kind: "text" } : { kind: "missing" });
      });
    return () => {
      cancelled = true;
      void loaded?.loadingTask.destroy();
    };
  }, [documentId, hasText]);

  const textPages = useMemo(
    () => (source.kind === "text" && document ? document.pages : []),
    [source.kind, document],
  );
  const sizes = useMemo<Size[]>(() => {
    if (source.kind === "pdf") return baseSizes;
    if (source.kind === "text")
      return textPages.map(
        (page, index) =>
          baseSizes[index] ?? { width: TEXT_PAGE_WIDTH, height: ESTIMATED_TEXT_PAGE_HEIGHT },
      );
    return [];
  }, [source.kind, baseSizes, textPages]);

  const measureTextPage = useCallback((pageNumber: number, height: number) => {
    setBaseSizes((current) => {
      const index = pageNumber - 1;
      if (current[index]?.height === height) return current;
      const next = [...current];
      for (let i = 0; i <= index; i += 1)
        next[i] ??= { width: TEXT_PAGE_WIDTH, height: ESTIMATED_TEXT_PAGE_HEIGHT };
      next[index] = { width: TEXT_PAGE_WIDTH, height };
      return next;
    });
  }, []);

  // Track the reader's width for "fit width" and for where margin comments go.
  useEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    const observer = new ResizeObserver(() => setBodyWidth(body.clientWidth));
    observer.observe(body);
    return () => observer.disconnect();
  }, []);

  // Thumbnails only when there's room for them, e.g. not in a split pane.
  const thumbsShown = source.kind === "pdf" && (showThumbs ?? bodyWidth >= 760);
  // Derived rather than measured, so showing the thumbnails doesn't re-fit the zoom a second time
  // (which would move you off the page you were sent to).
  const viewportWidth = Math.max(0, bodyWidth - (thumbsShown ? THUMBS_WIDTH : 0) - SCROLLBAR_WIDTH);
  const effectiveRotation: Rotation = source.kind === "pdf" ? rotation : 0;
  const fitScale = useCallback(() => {
    const first = sizes[0];
    if (!first || !viewportWidth) return 1;
    const pageWidth = effectiveRotation % 180 ? first.height : first.width;
    // Leave room for margin comments on wide screens, whether or not there are any yet, so the
    // zoom doesn't jump when the first comment is added.
    const room = viewportWidth - 48 - (viewportWidth > 900 ? MARGIN_WIDTH + 24 : 0);
    return clampScale(Math.min(room / pageWidth, 1.25));
  }, [sizes, viewportWidth, effectiveRotation]);

  const zoom = scale ?? (sizes.length && viewportWidth ? fitScale() : null);
  const zoomReady = zoom !== null;

  const displayed = useMemo(
    () =>
      sizes.map((size) => {
        const swap = effectiveRotation % 180 !== 0;
        const width = (swap ? size.height : size.width) * (zoom ?? 1);
        const height = (swap ? size.width : size.height) * (zoom ?? 1);
        return { width, height };
      }),
    [sizes, effectiveRotation, zoom],
  );
  const offsets = useMemo(
    () =>
      displayed.reduce<number[]>((tops, _, index) => {
        tops.push(index ? tops[index - 1] + displayed[index - 1].height + PAGE_GAP : PAD_TOP);
        return tops;
      }, []),
    [displayed],
  );
  const columnWidth = Math.max(0, ...displayed.map((size) => size.width));
  const totalHeight = (offsets.at(-1) ?? 0) + (displayed.at(-1)?.height ?? 0) + PAD_TOP;
  const marginFits = viewportWidth >= columnWidth + MARGIN_WIDTH + 72;

  // Render only pages near the viewport.
  useEffect(() => {
    const root = scrollRef.current;
    const pages = pagesRef.current;
    if (!root || !pages || !displayed.length) return;
    const observer = new IntersectionObserver(
      (records) =>
        setVisible((current) => {
          const next = new Set(current);
          for (const record of records) {
            const page = Number((record.target as HTMLElement).dataset.page);
            if (record.isIntersecting) next.add(page);
            else next.delete(page);
          }
          return next;
        }),
      { root, rootMargin: "800px 0px" },
    );
    pages.querySelectorAll<HTMLElement>("[data-page]").forEach((page) => observer.observe(page));
    return () => observer.disconnect();
  }, [displayed.length, source.kind, zoomReady]);

  const scrollToPage = useCallback(
    (pageNumber: number, fraction = 0) => {
      const scroller = scrollRef.current;
      const index = pageNumber - 1;
      if (!scroller || offsets[index] === undefined) return;
      scroller.scrollTo({
        top: Math.max(
          0,
          offsets[index] + fraction * displayed[index].height - (fraction ? 120 : 8),
        ),
        behavior: "smooth",
      });
    },
    [offsets, displayed],
  );

  const spotTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onScroll = () => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    const probe = scroller.scrollTop + scroller.clientHeight / 3;
    let page = 1;
    offsets.forEach((offset, index) => {
      if (offset <= probe) page = index + 1;
    });
    if (page !== currentPage) {
      setCurrentPage(page);
      setPageInput(String(page));
    }
    // Remember where you are, to reopen the paper at the same spot.
    if (spotTimer.current) clearTimeout(spotTimer.current);
    spotTimer.current = setTimeout(() => {
      const index = offsets.findLastIndex((offset) => offset <= scroller.scrollTop + 1);
      if (index < 0) return;
      const fraction = (scroller.scrollTop - offsets[index]) / displayed[index].height;
      saveLocal(`readingSpot.${documentId}`, { page: index + 1, fraction });
    }, 400);
  };

  // Keep the reading position when zooming.
  const setZoom = (next: number) => {
    const scroller = scrollRef.current;
    const ratio = scroller && totalHeight ? scroller.scrollTop / totalHeight : 0;
    setScale(clampScale(next));
    requestAnimationFrame(() => {
      if (scrollRef.current) scrollRef.current.scrollTop = ratio * scrollRef.current.scrollHeight;
    });
  };

  // Requests from outside: open at a page or annotation.
  const pendingFocus =
    focus && focus.documentId === documentId && !shownFocus.has(focus.nonce) ? focus : null;
  useEffect(() => {
    if (!pendingFocus || !zoomReady || !displayed.length) return;
    if (pendingFocus.annotationId && !annotations) return; // wait to find the highlight
    shownFocus.add(pendingFocus.nonce);
    const focus = pendingFocus;
    const annotation = annotations?.find((candidate) => candidate.id === focus.annotationId);
    const fraction = annotation
      ? Math.min(...annotation.rects.map((rect) => rotateRect(rect, effectiveRotation).y))
      : 0;
    // Defer so a freshly opened tab has laid out its pages.
    requestAnimationFrame(() => {
      scrollToPage(focus.pageNumber, fraction);
      if (annotation) setActiveId(annotation.id);
    });
  }, [pendingFocus, zoomReady, displayed.length, annotations, effectiveRotation, scrollToPage]);

  // Otherwise reopen where you left off.
  const restored = useRef(false);
  useEffect(() => {
    if (restored.current || !zoomReady || !displayed.length) return;
    restored.current = true;
    if (pendingFocus) return;
    const spot = loadLocal<{ page: number; fraction: number } | null>(
      `readingSpot.${documentId}`,
      null,
    );
    const index = spot ? spot.page - 1 : -1;
    if (!spot || offsets[index] === undefined) return;
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({
        top: offsets[index] + spot.fraction * displayed[index].height,
      });
    });
  }, [zoomReady, displayed, offsets, documentId, pendingFocus]);

  // ---- Annotations -------------------------------------------------------------------------

  const remember = useCallback((change: AnnotationChange) => {
    setHistory((current) => ({ undo: [...current.undo.slice(-99), change], redo: [] }));
  }, []);

  const apply = useCallback(async (target: Annotation | null, previous: Annotation | null) => {
    if (target) await saveAnnotation(target);
    else if (previous) await removeAnnotation(previous);
  }, []);

  const commit = useCallback(
    async (before: Annotation | null, after: Annotation | null) => {
      remember({ before, after });
      await apply(after, before);
    },
    [apply, remember],
  );

  const undo = useCallback(() => {
    const change = history.undo.at(-1);
    if (!change) return;
    setHistory((current) => ({
      undo: current.undo.slice(0, -1),
      redo: [...current.redo, change],
    }));
    void apply(change.before, change.after);
  }, [history.undo, apply]);

  const redo = useCallback(() => {
    const change = history.redo.at(-1);
    if (!change) return;
    setHistory((current) => ({
      undo: [...current.undo, change],
      redo: current.redo.slice(0, -1),
    }));
    void apply(change.after, change.before);
  }, [history.redo, apply]);

  const createAnnotation = useCallback(
    (pending: PendingSelection, withComment: boolean, highlightColor = color) => {
      const now = new Date().toISOString();
      const annotation: Annotation = {
        id: newId(),
        documentId,
        pageNumber: pending.pageNumber,
        rects: pending.rects,
        quote: pending.quote,
        color: highlightColor,
        comment: withComment ? "" : null,
        author,
        createdAt: now,
        updatedAt: now,
      };
      void commit(null, annotation);
      window.getSelection()?.removeAllRanges();
      setSelection(null);
      setActiveId(annotation.id);
      if (withComment) setEditingId(annotation.id);
      return annotation;
    },
    [author, color, commit, documentId],
  );

  const updateAnnotation = (annotation: Annotation, patch: Partial<Annotation>) =>
    void commit(annotation, { ...annotation, ...patch, updatedAt: new Date().toISOString() });

  const deleteAnnotation = (annotation: Annotation) => {
    void commit(annotation, null);
    setActiveId(null);
    setEditingId(null);
  };

  // Ctrl+Z / Ctrl+Shift+Z while the reader has focus (not while typing a comment).
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target.closest("textarea, input")) return;
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "z") return;
      event.preventDefault();
      if (event.shiftKey) redo();
      else undo();
    };
    root.addEventListener("keydown", onKey);
    return () => root.removeEventListener("keydown", onKey);
  }, [undo, redo]);

  // ---- Selection ----------------------------------------------------------------------------

  const onMouseUp = (event: ReactMouseEvent) => {
    if ((event.target as HTMLElement).closest(".selection-toolbar, .margin-comment")) return;
    // Let the browser finish updating the selection first.
    requestAnimationFrame(() => readSelection(event.clientX, event.clientY));
  };

  const readSelection = (clientX: number, clientY: number) => {
    const root = rootRef.current;
    const selected = window.getSelection();
    if (!root) return;
    if (!selected || selected.isCollapsed || !selected.rangeCount) {
      setSelection(null);
      hitTest(clientX, clientY);
      return;
    }
    const range = selected.getRangeAt(0);
    const start =
      range.startContainer instanceof Element
        ? range.startContainer
        : range.startContainer.parentElement;
    const pageElement = start?.closest<HTMLElement>("[data-page]");
    if (!pageElement || !pagesRef.current?.contains(pageElement)) return;
    const pageNumber = Number(pageElement.dataset.page);
    const box = pageElement.getBoundingClientRect();
    const rects = selectionToPageRects(
      [...range.getClientRects()].filter((rect) => rect.height < box.height * 0.08),
      box,
      effectiveRotation,
    );
    const quote = selected.toString().replace(/\s+/g, " ").trim();
    if (!rects.length || !quote) return;

    const pending = { pageNumber, rects, quote, x: 0, y: 0 };
    if (highlightMode) {
      createAnnotation(pending, false);
      return;
    }
    const last = [...range.getClientRects()].at(-1) ?? box;
    const rootBox = root.getBoundingClientRect();
    setActiveId(null);
    setSelection({
      ...pending,
      x: last.left + last.width / 2 - rootBox.left,
      y: last.top - rootBox.top,
    });
  };

  /** A click (no selection) on a highlight selects it. */
  const hitTest = (clientX: number, clientY: number) => {
    const element = window.document
      .elementsFromPoint(clientX, clientY)
      .find((candidate) => candidate instanceof HTMLElement && candidate.dataset.page);
    if (!(element instanceof HTMLElement) || !annotations) {
      setActiveId(null);
      return;
    }
    const pageNumber = Number(element.dataset.page);
    const box = element.getBoundingClientRect();
    const point = unrotateRect(
      {
        x: (clientX - box.left) / box.width,
        y: (clientY - box.top) / box.height,
        width: 0,
        height: 0,
      },
      effectiveRotation,
    );
    const hit = annotations.find(
      (annotation) =>
        annotation.pageNumber === pageNumber &&
        annotation.rects.some(
          (rect) =>
            point.x >= rect.x &&
            point.x <= rect.x + rect.width &&
            point.y >= rect.y &&
            point.y <= rect.y + rect.height,
        ),
    );
    setActiveId(hit?.id ?? null);
    if (!hit) setEditingId(null);
  };

  const active = annotations?.find((annotation) => annotation.id === activeId) ?? null;

  // Toolbar for a clicked highlight, placed above its first line.
  const activeToolbar = useMemo(() => {
    if (!active || editingId === active.id) return null;
    const index = active.pageNumber - 1;
    if (offsets[index] === undefined) return null;
    const first = rotateRect(active.rects[0], effectiveRotation);
    return { annotation: active, pageIndex: index, rect: first };
  }, [active, editingId, offsets, effectiveRotation]);

  // ---- Margin comments ----------------------------------------------------------------------

  const commented = useMemo(
    () => (annotations ?? []).filter((annotation) => annotation.comment !== null),
    [annotations],
  );
  const marginTops = useMemo(() => {
    const items = commented.flatMap((annotation) => {
      const index = annotation.pageNumber - 1;
      if (offsets[index] === undefined) return [];
      const top = Math.min(
        ...annotation.rects.map((rect) => rotateRect(rect, effectiveRotation).y),
      );
      return [
        {
          id: annotation.id,
          top: offsets[index] + top * displayed[index].height,
          height: cardHeights[annotation.id] ?? 96,
        },
      ];
    });
    return layoutMargin(items, 8, activeId);
  }, [commented, offsets, displayed, cardHeights, effectiveRotation, activeId]);

  const measureCard = useCallback((id: string, height: number) => {
    setCardHeights((current) => (current[id] === height ? current : { ...current, [id]: height }));
  }, []);

  const askAboutSelection = (pending: { pageNumber: number; quote: string }) => {
    onAskAi({ documentId, pageNumber: pending.pageNumber, text: pending.quote });
    window.getSelection()?.removeAllRanges();
    setSelection(null);
  };

  // ---- Render -------------------------------------------------------------------------------

  const pageCount = source.kind === "pdf" ? source.pdf.numPages : textPages.length;
  const title = document?.title ?? entry.name;

  return (
    <div className="paper-view" ref={rootRef} tabIndex={-1}>
      <header className="view-header paper-toolbar">
        <button
          type="button"
          className="clickable-icon"
          aria-label={thumbsShown ? "Hide page thumbnails" : "Show page thumbnails"}
          aria-pressed={thumbsShown}
          title="Page thumbnails"
          disabled={source.kind !== "pdf"}
          onClick={() => setShowThumbs(!thumbsShown)}
        >
          <GalleryVertical size={18} />
        </button>
        <h1 className="view-header-title" title={title}>
          {title}
        </h1>
        <form
          className="paper-page-input"
          onSubmit={(event) => {
            event.preventDefault();
            const page = Math.min(Math.max(1, Number(pageInput) || 1), pageCount || 1);
            setPageInput(String(page));
            scrollToPage(page);
          }}
        >
          <input
            aria-label="Page"
            value={pageInput}
            inputMode="numeric"
            onChange={(event) => setPageInput(event.target.value.replace(/\D/g, ""))}
            onBlur={() => setPageInput(String(currentPage))}
          />
          <span>/ {pageCount || "–"}</span>
        </form>
        <span className="toolbar-divider" aria-hidden />
        <button
          type="button"
          className="clickable-icon"
          aria-label="Zoom out"
          title="Zoom out"
          onClick={() => setZoom((zoom ?? 1) - 0.1)}
        >
          <Minus size={18} />
        </button>
        <ZoomInput value={zoom ?? 1} onChange={setZoom} />
        <button
          type="button"
          className="clickable-icon"
          aria-label="Zoom in"
          title="Zoom in"
          onClick={() => setZoom((zoom ?? 1) + 0.1)}
        >
          <Plus size={18} />
        </button>
        <span className="toolbar-divider" aria-hidden />
        <button
          type="button"
          className="clickable-icon"
          aria-label="Fit to width"
          title="Fit to width"
          onClick={() => setScale(null)}
        >
          <StretchHorizontal size={18} />
        </button>
        <button
          type="button"
          className="clickable-icon"
          aria-label="Rotate clockwise"
          title="Rotate clockwise"
          disabled={source.kind !== "pdf"}
          onClick={() => setRotation((value) => ((value + 90) % 360) as Rotation)}
        >
          <RotateCw size={18} />
        </button>
        <span className="toolbar-divider" aria-hidden />
        <button
          type="button"
          className="clickable-icon"
          aria-label="Highlighter: highlight text as you select it"
          title="Highlighter (select text to highlight)"
          aria-pressed={highlightMode}
          onClick={() => setHighlightMode((value) => !value)}
        >
          <Highlighter size={18} />
        </button>
        <button
          type="button"
          className="clickable-icon"
          aria-label="Undo"
          title="Undo (Ctrl+Z)"
          disabled={!history.undo.length}
          onClick={undo}
        >
          <Undo2 size={18} />
        </button>
        <button
          type="button"
          className="clickable-icon"
          aria-label="Redo"
          title="Redo (Ctrl+Shift+Z)"
          disabled={!history.redo.length}
          onClick={redo}
        >
          <Redo2 size={18} />
        </button>
      </header>

      <div className="paper-body" ref={bodyRef}>
        {source.kind === "pdf" && thumbsShown && (
          <nav className="paper-thumbs" aria-label="Pages">
            {Array.from({ length: source.pdf.numPages }, (_, index) => (
              <button
                type="button"
                key={index}
                className="paper-thumb"
                aria-current={currentPage === index + 1 ? "page" : undefined}
                onClick={() => scrollToPage(index + 1)}
              >
                <span
                  className="paper-thumb-frame"
                  style={{
                    aspectRatio: sizes[index]
                      ? `${sizes[index].width} / ${sizes[index].height}`
                      : undefined,
                  }}
                >
                  <LazyThumb>
                    <PdfThumbnail pdf={source.pdf} pageNumber={index + 1} width={THUMB_WIDTH} />
                  </LazyThumb>
                </span>
                <span className="paper-thumb-label">{index + 1}</span>
              </button>
            ))}
          </nav>
        )}

        <div className="paper-scroll" ref={scrollRef} onScroll={onScroll} onMouseUp={onMouseUp}>
          {source.kind === "loading" && <p className="paper-status">Opening paper…</p>}
          {source.kind === "missing" && (
            <p className="paper-status">This paper&apos;s file is no longer stored.</p>
          )}
          {(source.kind === "pdf" || source.kind === "text") && zoom !== null && (
            <div
              className={marginFits ? "paper-stack" : "paper-stack is-narrow"}
              style={{ minHeight: totalHeight }}
            >
              <div
                className="paper-pages"
                ref={pagesRef}
                style={{ width: columnWidth, height: totalHeight }}
              >
                {displayed.map((size, index) => (
                  <div
                    key={index}
                    className={source.kind === "pdf" ? "paper-page" : "paper-page is-text"}
                    data-page={index + 1}
                    style={
                      {
                        top: offsets[index],
                        width: size.width,
                        height: size.height,
                        "--total-scale-factor": zoom,
                        "--scale-round-x": "1px",
                        "--scale-round-y": "1px",
                      } as CSSProperties
                    }
                  >
                    <div className="highlight-layer" aria-hidden>
                      {annotations
                        ?.filter((annotation) => annotation.pageNumber === index + 1)
                        .flatMap((annotation) =>
                          annotation.rects.map((rect, rectIndex) => {
                            const shown = rotateRect(rect, effectiveRotation);
                            return (
                              <span
                                key={`${annotation.id}-${rectIndex}`}
                                className="highlight-rect"
                                data-color={annotation.color}
                                data-active={annotation.id === activeId || undefined}
                                style={{
                                  left: `${shown.x * 100}%`,
                                  top: `${shown.y * 100}%`,
                                  width: `${shown.width * 100}%`,
                                  height: `${shown.height * 100}%`,
                                }}
                              />
                            );
                          }),
                        )}
                    </div>
                    {source.kind === "pdf"
                      ? visible.has(index + 1) && (
                          <PdfPageCanvas
                            pdf={source.pdf}
                            pageNumber={index + 1}
                            scale={zoom}
                            rotation={effectiveRotation}
                          />
                        )
                      : textPages[index] && (
                          <TextSheet
                            page={textPages[index]}
                            scale={zoom}
                            onMeasure={measureTextPage}
                          />
                        )}
                  </div>
                ))}
                {activeToolbar && (
                  <SelectionToolbar
                    style={{
                      position: "absolute",
                      left:
                        (activeToolbar.rect.x + activeToolbar.rect.width / 2) *
                        displayed[activeToolbar.pageIndex].width,
                      top:
                        offsets[activeToolbar.pageIndex] +
                        activeToolbar.rect.y * displayed[activeToolbar.pageIndex].height,
                    }}
                    color={activeToolbar.annotation.color}
                    hasComment={activeToolbar.annotation.comment !== null}
                    onColor={(next) => updateAnnotation(activeToolbar.annotation, { color: next })}
                    onHighlight={null}
                    onComment={() => {
                      if (activeToolbar.annotation.comment === null)
                        updateAnnotation(activeToolbar.annotation, { comment: "" });
                      setEditingId(activeToolbar.annotation.id);
                    }}
                    onAskAi={() =>
                      askAboutSelection({
                        pageNumber: activeToolbar.annotation.pageNumber,
                        quote: activeToolbar.annotation.quote,
                      })
                    }
                    onDelete={() => deleteAnnotation(activeToolbar.annotation)}
                  />
                )}
              </div>

              {commented.length > 0 && (
                <aside
                  className="paper-margin"
                  aria-label="Comments"
                  style={{ height: totalHeight }}
                >
                  {commented.map((annotation) => (
                    <MarginComment
                      key={annotation.id}
                      annotation={annotation}
                      top={marginTops.get(annotation.id) ?? 0}
                      active={annotation.id === activeId}
                      editing={annotation.id === editingId}
                      onMeasure={measureCard}
                      onActivate={() => setActiveId(annotation.id)}
                      onEdit={() => {
                        setActiveId(annotation.id);
                        setEditingId(annotation.id);
                      }}
                      onSave={(comment) => {
                        updateAnnotation(annotation, { comment });
                        setEditingId(null);
                      }}
                      onCancel={() => {
                        setEditingId(null);
                        // A comment that was never written leaves just the highlight.
                        if (!annotation.comment) updateAnnotation(annotation, { comment: null });
                      }}
                      onDeleteComment={() => {
                        updateAnnotation(annotation, { comment: null });
                        setEditingId(null);
                      }}
                      onAskAi={() =>
                        askAboutSelection({
                          pageNumber: annotation.pageNumber,
                          quote: annotation.quote,
                        })
                      }
                    />
                  ))}
                </aside>
              )}
            </div>
          )}
        </div>
      </div>

      {selection && (
        <SelectionToolbar
          style={{ position: "absolute", left: selection.x, top: selection.y }}
          color={color}
          hasComment={false}
          onColor={(next) => {
            setColor(next);
            createAnnotation(selection, false, next);
          }}
          onHighlight={() => createAnnotation(selection, false)}
          onComment={() => createAnnotation(selection, true)}
          onAskAi={() => askAboutSelection(selection)}
          onDelete={null}
        />
      )}
    </div>
  );
}

function clampScale(value: number) {
  return Math.round(Math.min(MAX_SCALE, Math.max(MIN_SCALE, value)) * 100) / 100;
}

function ZoomInput({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <input
      className="paper-zoom-input"
      aria-label="Zoom percentage"
      value={draft ?? `${Math.round(value * 100)}%`}
      onFocus={(event) => {
        setDraft(String(Math.round(value * 100)));
        requestAnimationFrame(() => event.target.select());
      }}
      onChange={(event) => setDraft(event.target.value.replace(/[^\d]/g, ""))}
      onBlur={() => {
        if (draft) onChange(Number(draft) / 100);
        setDraft(null);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
        if (event.key === "Escape") {
          setDraft(null);
          requestAnimationFrame(() => event.currentTarget?.blur());
        }
      }}
    />
  );
}

/** Renders its child only once scrolled near view, so long papers don't draw every thumbnail. */
function LazyThumb({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!element || shown) return;
    const observer = new IntersectionObserver(
      (records) => {
        if (records.some((record) => record.isIntersecting)) setShown(true);
      },
      { rootMargin: "400px 0px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [shown]);
  return <span ref={ref}>{shown && children}</span>;
}
