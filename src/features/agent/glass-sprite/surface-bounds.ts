export interface SurfaceRectangle {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/** Visible AI section, intersected with the sidebar and ending before controls.
 * Coordinates are client pixels; there is no radius-based interaction limit.
 */
export function aiVisualRectangle(
  area: SurfaceRectangle,
  sidebar: SurfaceRectangle,
  controls?: SurfaceRectangle | null,
  footer?: SurfaceRectangle | null,
  inset = 6,
): SurfaceRectangle {
  const left = Math.max(area.left, sidebar.left) + inset;
  const right = Math.min(area.right, sidebar.right) - inset;
  const top = Math.max(area.top, sidebar.top) + inset;
  const bottom =
    Math.min(area.bottom, sidebar.bottom, controls?.top ?? Infinity, footer?.top ?? Infinity) -
    inset;
  return { left, right: Math.max(left, right), top, bottom: Math.max(top, bottom) };
}

/** Limit the deformation field, not individual vertices or the body's transform.
 * Bounds are in normalized device coordinates. Homogeneous inequalities account
 * for perspective and the blob's rotation, scale, depth, and fixed world anchor.
 */
export function containSurface(
  base: ArrayLike<number>,
  deformed: Float64Array,
  matrix: ArrayLike<number>,
  bounds: SurfaceRectangle,
): number {
  let safeExtension = Infinity;
  const limit = (gap: number, slope: number) => {
    if (gap < 0) safeExtension = 0;
    else if (slope < 0) safeExtension = Math.min(safeExtension, gap / -slope);
  };
  for (let i = 0; i < base.length; i += 3) {
    const x = base[i],
      y = base[i + 1],
      z = base[i + 2];
    const dx = deformed[i] - x,
      dy = deformed[i + 1] - y,
      dz = deformed[i + 2] - z;
    const bx = matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12];
    const by = matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13];
    const bw = matrix[3] * x + matrix[7] * y + matrix[11] * z + matrix[15];
    const vx = matrix[0] * dx + matrix[4] * dy + matrix[8] * dz;
    const vy = matrix[1] * dx + matrix[5] * dy + matrix[9] * dz;
    const vw = matrix[3] * dx + matrix[7] * dy + matrix[11] * dz;
    limit(bx - bounds.left * bw, vx - bounds.left * vw);
    limit(bounds.right * bw - bx, bounds.right * vw - vx);
    limit(by - bounds.bottom * bw, vy - bounds.bottom * vw);
    limit(bounds.top * bw - by, bounds.top * vw - vy);
    limit(bw - 1e-6, vw);
  }
  // Let the spring field move freely in the center. Within the last 30% of
  // available travel, smoothly increase resistance and asymptotically approach
  // the rectangular mesh limit rather than hitting an abrupt hard stop.
  let blend = 1;
  if (safeExtension <= 0) blend = 0;
  else if (1 / safeExtension > 0.7) {
    blend = Math.min(
      1,
      safeExtension * (0.7 + 0.3 * Math.tanh((1 / safeExtension - 0.7) / 0.3)) * (1 - 1e-9),
    );
  }
  if (blend < 1) {
    for (let i = 0; i < deformed.length; i++)
      deformed[i] = base[i] + (deformed[i] - base[i]) * blend;
  }
  return blend;
}
