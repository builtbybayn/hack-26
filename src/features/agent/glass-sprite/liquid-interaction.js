import { measureVolume } from "./surface.js";

// Independent displacement field: the procedural animation remains the rest shape.
export class LiquidInteraction {
  constructor(surface) {
    this.surface = surface;
    const length = surface.idle.length;
    this.offset = new Float64Array(length);
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
    this.pull = [0, 0, 0];
    this.active = false;
    this.awake = false;
    this.accumulator = 0;
  }
  grab(point, base) {
    this.active = this.awake = true;
    this.pull.fill(0);
    for (let i = 0; i < this.weights.length; i++) {
      const j = i * 3;
      const distance = Math.hypot(base[j] - point.x, base[j + 1] - point.y, base[j + 2] - point.z);
      this.weights[i] = Math.exp((-distance * distance) / 0.42);
    }
  }
  move(delta) {
    const length = Math.hypot(delta.x, delta.y, delta.z);
    const limit = (0.48 * Math.tanh(length / 0.48)) / (length || 1);
    this.pull[0] = delta.x * limit;
    this.pull[1] = delta.y * limit;
    this.pull[2] = delta.z * limit;
  }
  release() {
    this.active = false;
    this.pull.fill(0);
  }
  update(dt, base, reducedMotion = false) {
    this.positions.set(base);
    if (!this.awake) return this.positions;
    this.accumulator += Math.min(Math.max(dt, 0), 0.05);
    const h = 1 / 120,
      damping = reducedMotion ? 23 : this.active ? 13 : 7;
    while (this.accumulator >= h) {
      this.accumulator -= h;
      for (let vertex = 0; vertex < this.weights.length; vertex++) {
        const ns = this.neighbors[vertex],
          start = vertex * 3;
        for (let axis = 0; axis < 3; axis++) {
          const j = start + axis;
          let mean = 0;
          for (const n of ns) mean += this.offset[n * 3 + axis];
          const tension = mean / ns.length - this.offset[j];
          const target = this.active ? this.pull[axis] * this.weights[vertex] : 0;
          const force =
            (this.active ? 115 : 65) * (target - this.offset[j]) +
            95 * tension -
            damping * this.velocity[j];
          this.nextVelocity[j] = this.velocity[j] + force * h;
        }
      }
      this.velocity.set(this.nextVelocity);
      for (let j = 0; j < this.offset.length; j++) this.offset[j] += this.velocity[j] * h;
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
    // Correct the small volume change, then bound the pulled silhouette inside its
    // existing camera margin. This never touches the untouched Thinking rest shape.
    const volume = measureVolume(this.positions, this.surface.indices);
    const scale = Math.cbrt(measureVolume(base, this.surface.indices) / Math.max(volume, 0.001));
    for (let j = 0; j < base.length; j += 3) {
      const radius =
        Math.hypot(this.positions[j], this.positions[j + 1], this.positions[j + 2]) * scale;
      const safeScale = scale * Math.min(1, 1.79 / radius);
      this.positions[j] *= safeScale;
      this.positions[j + 1] *= safeScale;
      this.positions[j + 2] *= safeScale;
    }
    return this.positions;
  }
}
