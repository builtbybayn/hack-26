import { describe, expect, it } from "vitest";
import {
  layoutMargin,
  mergeLineRects,
  rotateRect,
  selectionToPageRects,
  unrotateRect,
  type Rotation,
} from "./geometry";

const close = (actual: object, expected: object) =>
  Object.entries(expected).forEach(([key, value]) =>
    expect((actual as Record<string, number>)[key]).toBeCloseTo(value as number),
  );

describe("rotation", () => {
  const rect = { x: 0.1, y: 0.2, width: 0.3, height: 0.05 };

  it("round-trips at every rotation", () => {
    for (const rotation of [0, 90, 180, 270] as Rotation[])
      close(unrotateRect(rotateRect(rect, rotation), rotation), rect);
  });

  it("rotates clockwise", () => {
    // The top-left corner moves to the top-right when turned 90° clockwise.
    close(rotateRect(rect, 90), { x: 0.75, y: 0.1, width: 0.05, height: 0.3 });
    close(rotateRect(rect, 180), { x: 0.6, y: 0.75 });
  });
});

describe("selectionToPageRects", () => {
  const page = { left: 100, top: 50, width: 200, height: 400 };

  it("normalizes to the page, clips, and merges a line's fragments", () => {
    const rects = selectionToPageRects(
      [
        { left: 120, top: 90, width: 40, height: 10 },
        { left: 160, top: 90, width: 60, height: 10 },
        { left: 280, top: 110, width: 100, height: 10 }, // runs off the right edge
        { left: 0, top: 0, width: 10, height: 10 }, // outside the page
      ],
      page,
    );
    expect(rects).toHaveLength(2);
    close(rects[0], { x: 0.1, y: 0.1, width: 0.5, height: 0.025 });
    close(rects[1], { x: 0.9, y: 0.15, width: 0.1 });
  });

  it("stores rotated selections in unrotated coordinates", () => {
    const [rect] = selectionToPageRects([{ left: 150, top: 50, width: 10, height: 40 }], page, 90);
    close(rotateRect(rect, 90), { x: 0.25, y: 0, width: 0.05, height: 0.1 });
  });
});

describe("mergeLineRects", () => {
  it("keeps separate lines apart", () => {
    expect(
      mergeLineRects([
        { x: 0, y: 0, width: 0.2, height: 0.02 },
        { x: 0, y: 0.03, width: 0.2, height: 0.02 },
      ]),
    ).toHaveLength(2);
  });
});

describe("layoutMargin", () => {
  it("pushes colliding comments down in order", () => {
    const positions = layoutMargin([
      { id: "b", top: 105, height: 50 },
      { id: "a", top: 100, height: 50 },
      { id: "c", top: 400, height: 50 },
    ]);
    expect(Object.fromEntries(positions)).toEqual({ a: 100, b: 158, c: 400 });
  });

  it("keeps the active comment at its highlight and moves others around it", () => {
    const positions = layoutMargin(
      [
        { id: "a", top: 100, height: 50 },
        { id: "b", top: 105, height: 50 },
      ],
      8,
      "b",
    );
    expect(Object.fromEntries(positions)).toEqual({ a: 47, b: 105 });
  });
});
