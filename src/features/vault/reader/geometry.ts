/**
 * Geometry for highlights and margin comments. Highlights are stored as fractions of the unrotated
 * page, so they stay put at any zoom or rotation.
 */
import type { PageRect } from "@/types/vault";

export type Rotation = 0 | 90 | 180 | 270;

/** Maps a rect on the unrotated page to where it shows on the page rotated clockwise. */
export function rotateRect(rect: PageRect, rotation: Rotation): PageRect {
  const { x, y, width, height } = rect;
  switch (rotation) {
    case 0:
      return rect;
    case 90:
      return { x: 1 - y - height, y: x, width: height, height: width };
    case 180:
      return { x: 1 - x - width, y: 1 - y - height, width, height };
    case 270:
      return { x: y, y: 1 - x - width, width: height, height: width };
  }
}

/** The inverse of `rotateRect`: from the displayed (rotated) page back to the unrotated page. */
export function unrotateRect(rect: PageRect, rotation: Rotation): PageRect {
  const inverse = ((360 - rotation) % 360) as Rotation;
  return rotateRect(rect, inverse);
}

interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Converts a selection's client rects into page rects: relative to the page, clipped to it,
 * unrotated, and merged so each line of text is one rect.
 */
export function selectionToPageRects(
  clientRects: Box[],
  page: Box,
  rotation: Rotation = 0,
): PageRect[] {
  const displayed = clientRects
    .map((rect) => {
      const left = Math.max(rect.left, page.left);
      const top = Math.max(rect.top, page.top);
      const right = Math.min(rect.left + rect.width, page.left + page.width);
      const bottom = Math.min(rect.top + rect.height, page.top + page.height);
      return { left, top, width: right - left, height: bottom - top };
    })
    .filter((rect) => rect.width > 0.5 && rect.height > 0.5);
  return mergeLineRects(
    displayed.map((rect) =>
      unrotateRect(
        {
          x: (rect.left - page.left) / page.width,
          y: (rect.top - page.top) / page.height,
          width: rect.width / page.width,
          height: rect.height / page.height,
        },
        rotation,
      ),
    ),
  );
}

/** Joins rects that sit on the same line and touch or overlap, and drops contained duplicates. */
export function mergeLineRects(rects: PageRect[]): PageRect[] {
  const sorted = [...rects].sort((a, b) => a.y - b.y || a.x - b.x);
  const merged: PageRect[] = [];
  for (const rect of sorted) {
    const previous = merged.at(-1);
    if (previous && sameLine(previous, rect) && rect.x <= previous.x + previous.width + 0.01) {
      const x = Math.min(previous.x, rect.x);
      const y = Math.min(previous.y, rect.y);
      const right = Math.max(previous.x + previous.width, rect.x + rect.width);
      const bottom = Math.max(previous.y + previous.height, rect.y + rect.height);
      merged[merged.length - 1] = { x, y, width: right - x, height: bottom - y };
    } else {
      merged.push(rect);
    }
  }
  return merged;
}

function sameLine(a: PageRect, b: PageRect): boolean {
  const overlap = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return overlap > Math.min(a.height, b.height) * 0.5;
}

export interface MarginItem {
  id: string;
  /** Where the item wants to sit (the top of its highlight), in pixels. */
  top: number;
  height: number;
}

/**
 * Places margin comments as close to their highlights as possible without overlapping, like
 * Google Docs: items keep their order and get pushed down when they would collide. The active
 * item is placed exactly at its highlight and the others make room around it.
 */
export function layoutMargin(
  items: MarginItem[],
  gap = 8,
  activeId: string | null = null,
): Map<string, number> {
  const sorted = [...items].sort((a, b) => a.top - b.top);
  const positions = new Map<string, number>();
  const anchorIndex = sorted.findIndex((item) => item.id === activeId);

  if (anchorIndex === -1) {
    let floor = -Infinity;
    for (const item of sorted) {
      const top = Math.max(item.top, floor);
      positions.set(item.id, top);
      floor = top + item.height + gap;
    }
    return positions;
  }

  const anchor = sorted[anchorIndex];
  positions.set(anchor.id, anchor.top);
  let floor = anchor.top + anchor.height + gap;
  for (const item of sorted.slice(anchorIndex + 1)) {
    const top = Math.max(item.top, floor);
    positions.set(item.id, top);
    floor = top + item.height + gap;
  }
  let ceiling = anchor.top - gap;
  for (const item of sorted.slice(0, anchorIndex).reverse()) {
    const top = Math.min(item.top, ceiling - item.height);
    positions.set(item.id, top);
    ceiling = top - gap;
  }
  return positions;
}
