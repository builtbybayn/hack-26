import { measureVolume } from "./surface.js";

// Independent displacement field: the procedural animation remains the rest shape.
export class LiquidInteraction {
  constructor(surface) {
    this.surface = surface;
    const length = surface.idle.length;
    this.offset = new Float64Array(length);
    this.grabOffset = new Float64Array(length);
    this.velocity = new Float64Array(length);
    this.nextVelocity = new Float64Array(length);
    this.positions = new Float64Array(length);
    this.weights = new Float64Array(length / 3);
    const neighbors = Array.from({ length: length / 3 }, () => new Set());
    for (let i = 0; i < surface.indices.length; i += 3) {
      const [a, b, c] = surface.indices.subarray(i, i + 3);
      neighbors[a].add(b);
      neighbors[a].add(c);
      neighbors[b].add(a);
      neighbors[b].add(c);
      neighbors[c].add(a);
      neighbors[c].add(b);
    }
    this.neighbors = neighbors.map((set) => [...set]);
    this.pullLimit = 2.8;
    this.maxStrain = 3.2;
    this.pull = [0, 0, 0];
    this.pointerVelocity = [0, 0, 0];
    this.lastMove = 0;
    this.active = false;
    this.awake = false;
    this.accumulator = 0;
  }
  grab(point, base) {
    this.active = this.awake = true;
    // A fresh grab attaches to the currently wobbling surface, not an earlier
    // rest shape. Preserve deformation so repeated pulls do not reset the neck.
    this.grabOffset.set(this.offset);
    this.pull.fill(0);
    this.pointerVelocity.fill(0);
    this.lastMove = performance.now();
    for (let i = 0; i < this.weights.length; i++) {
      const j = i * 3;
      const distance = Math.hypot(base[j] - point.x, base[j + 1] - point.y, base[j + 2] - point.z);
      this.weights[i] = Math.exp((-distance * distance) / 0.72);
    }
  }
  move(delta) {
    const length = Math.hypot(delta.x, delta.y, delta.z);
    // Increasing material resistance limits strain, not distance from the orb center.
    const limit = 1 / Math.sqrt(1 + (length / this.pullLimit) ** 2);
    const now = performance.now();
    const dt = Math.max(1 / 120, Math.min(0.1, (now - this.lastMove) / 1000));
    [delta.x, delta.y, delta.z].forEach((value, axis) => {
      const target = value * limit;
      this.pointerVelocity[axis] = Math.max(-4, Math.min(4, (target - this.pull[axis]) / dt));
      this.pull[axis] = target;
    });
    this.lastMove = now;
  }
  release() {
    if (this.active && performance.now() - this.lastMove < 100) {
      for (let v = 0; v < this.weights.length; v++)
        for (let axis = 0; axis < 3; axis++)
          this.velocity[v * 3 + axis] += this.pointerVelocity[axis] * this.weights[v] * 0.18;
    }
    this.active = false;
    this.pull.fill(0);
  }
  update(dt, base, reducedMotion = false) {
    this.positions.set(base);
    if (!this.awake) return this.positions;
    this.accumulator += Math.min(Math.max(dt, 0), 0.05);
    const h = 1 / 120,
      damping = reducedMotion ? 23 : this.active ? 18 : 4.8;
    while (this.accumulator >= h) {
      this.accumulator -= h;
      for (let vertex = 0; vertex < this.weights.length; vertex++) {
        const ns = this.neighbors[vertex],
          start = vertex * 3;
        const influence = this.weights[vertex] - 0.07 * (1 - this.weights[vertex]);
        const targetLength = Math.hypot(
          this.grabOffset[start] + this.pull[0] * influence,
          this.grabOffset[start + 1] + this.pull[1] * influence,
          this.grabOffset[start + 2] + this.pull[2] * influence,
        );
        // Bound accumulated strain across re-grabs, not the surface's radius.
        const strainLimit = Math.min(1, this.maxStrain / Math.max(targetLength, 1e-8));
        for (let axis = 0; axis < 3; axis++) {
          const j = start + axis;
          let mean = 0;
          for (const n of ns) mean += this.offset[n * 3 + axis];
          const tension = mean / ns.length - this.offset[j];
          const target = this.active
            ? (this.grabOffset[j] + this.pull[axis] * influence) * strainLimit
            : 0;
          const force =
            (this.active ? 210 : 48) * (target - this.offset[j]) +
            180 * tension -
            damping * this.velocity[j];
          this.nextVelocity[j] = this.velocity[j] + force * h;
        }
      }
      this.velocity.set(this.nextVelocity);
      for (let j = 0; j < this.offset.length; j++) this.offset[j] += this.velocity[j] * h;
    }
    // Keep triangle orientation consistent with the animated rest surface. This
    // strain safeguard responds to folding, never to a distance from the center.
    // Reducing both displacement and momentum prevents stored energy from snapping
    // the mesh through itself on the following integration step.
    const indices = this.surface.indices;
    let strainScale = 1;
    for (let attempt = 0; attempt < 12; attempt++) {
      let folded = false;
      for (let i = 0; i < indices.length; i += 3) {
        const a = indices[i] * 3,
          b = indices[i + 1] * 3,
          c = indices[i + 2] * 3;
        const ux = base[b] - base[a],
          uy = base[b + 1] - base[a + 1],
          uz = base[b + 2] - base[a + 2];
        const vx = base[c] - base[a],
          vy = base[c + 1] - base[a + 1],
          vz = base[c + 2] - base[a + 2];
        const nx = uy * vz - uz * vy,
          ny = uz * vx - ux * vz,
          nz = ux * vy - uy * vx;
        const dx = ux + strainScale * (this.offset[b] - this.offset[a]);
        const dy = uy + strainScale * (this.offset[b + 1] - this.offset[a + 1]);
        const dz = uz + strainScale * (this.offset[b + 2] - this.offset[a + 2]);
        const ex = vx + strainScale * (this.offset[c] - this.offset[a]);
        const ey = vy + strainScale * (this.offset[c + 1] - this.offset[a + 1]);
        const ez = vz + strainScale * (this.offset[c + 2] - this.offset[a + 2]);
        if (
          nx * (dy * ez - dz * ey) + ny * (dz * ex - dx * ez) + nz * (dx * ey - dy * ex) <
          0.08 * (nx * nx + ny * ny + nz * nz)
        ) {
          folded = true;
          break;
        }
      }
      if (!folded) break;
      strainScale *= 0.8;
    }
    if (strainScale < 1)
      for (let j = 0; j < base.length; j++) {
        this.offset[j] *= strainScale;
        this.velocity[j] *= strainScale;
      }
    let energy = 0;
    for (let j = 0; j < base.length; j++) {
      this.positions[j] += this.offset[j];
      energy += this.offset[j] ** 2 + this.velocity[j] ** 2 * 0.01;
    }
    if (!this.active && energy < 1e-7) {
      this.offset.fill(0);
      this.velocity.fill(0);
      this.positions.set(base);
      this.awake = false;
      this.accumulator = 0;
      return this.positions;
    }
    // Volume correction is uniform; never project vertices onto a containing sphere.
    const volume = measureVolume(this.positions, this.surface.indices);
    const scale = Math.cbrt(measureVolume(base, this.surface.indices) / Math.max(volume, 0.001));
    const safeScale = Math.max(0.65, Math.min(1.35, scale));
    for (let j = 0; j < base.length; j++) this.positions[j] *= safeScale;
    return this.positions;
  }
}
