export interface LabelRect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export const overlaps = (a: LabelRect, b: LabelRect) =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
export function shortLabel(title: string, measure: (s: string) => number, maxWidth = 142) {
  if (measure(title) <= maxWidth) return title;
  let lo = 0,
    hi = title.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (measure(title.slice(0, mid) + "…") <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  return title.slice(0, lo).trimEnd() + "…";
}
