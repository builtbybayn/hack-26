import { expect, it } from "vitest";
// The renderer's JS modules are also exercised directly without a WebGL context.
import { LiquidInteraction } from "./liquid-interaction.js";
import { createSurface, measureVolume } from "./surface.js";
it("pulls a local patch, preserves volume, and settles after repeated velocity impulses", () => {
  const surface = createSurface();
  const physics = new LiquidInteraction(surface);
  const point = { x: 1.52, y: 0, z: 0 };
  physics.grab(point, surface.idle);
  physics.move({ x: 2, y: 0.1, z: 0 });
  for (let i = 0; i < 120; i++) physics.update(1 / 120, surface.idle);
  expect(Math.max(...physics.offset)).toBeGreaterThan(1);
  expect(
    Math.abs(
      measureVolume(physics.positions, surface.indices) /
        measureVolume(surface.idle, surface.indices) -
        1,
    ),
  ).toBeLessThan(0.02);
  expect(Math.max(...physics.positions)).toBeGreaterThan(2.5);
  physics.release();
  let crossed = false;
  for (let i = 0; i < 1200; i++) {
    physics.update(i === 20 ? 5 : 1 / 120, surface.idle);
    crossed ||= Math.min(...physics.offset) < -0.02;
    expect(physics.positions.every(Number.isFinite)).toBe(true);
  }
  expect(crossed).toBe(true);
  expect(physics.awake).toBe(false);
  surface.geometry.dispose();
});

it("keeps extreme inward and tangential pulls finite without inverted triangles", () => {
  const surface = createSurface();
  const physics = new LiquidInteraction(surface);
  physics.grab({ x: 1.52, y: 0, z: 0 }, surface.idle);
  for (const delta of [
    { x: -100, y: 0, z: 0 },
    { x: 0, y: 100, z: 0 },
    { x: 100, y: -100, z: 0 },
  ]) {
    physics.move(delta);
    for (let i = 0; i < 90; i++) physics.update(1 / 60, surface.idle);
    expect(physics.positions.every(Number.isFinite)).toBe(true);
    expect(measureVolume(physics.positions, surface.indices)).toBeGreaterThan(0);
    expect(Math.max(...physics.positions.map(Math.abs))).toBeLessThan(6);
    for (let i = 0; i < surface.indices.length; i += 3) {
      const [a, b, c] = Array.from(surface.indices.slice(i, i + 3), (n) => n * 3);
      const normal = (p: ArrayLike<number>) => {
        const u = [p[b] - p[a], p[b + 1] - p[a + 1], p[b + 2] - p[a + 2]];
        const v = [p[c] - p[a], p[c + 1] - p[a + 1], p[c + 2] - p[a + 2]];
        return [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
      };
      const rest = normal(surface.idle),
        deformed = normal(physics.positions);
      expect(rest.reduce((sum, n, axis) => sum + n * deformed[axis], 0)).toBeGreaterThan(0);
    }
  }
  surface.geometry.dispose();
});

it("reattaches repeated grabs to the deformed surface without resetting the spring target", () => {
  const surface = createSurface();
  const physics = new LiquidInteraction(surface);
  physics.grab({ x: 1.52, y: 0, z: 0 }, surface.idle);
  physics.move({ x: 1.3, y: 0.2, z: 0 });
  for (let i = 0; i < 180; i++) physics.update(1 / 120, surface.idle);
  physics.release();
  physics.update(1 / 120, surface.idle);
  const before = Float64Array.from(physics.offset);
  const tip = physics.positions.reduce(
    (best, value, i) => (i % 3 === 0 && value > physics.positions[best] ? i : best),
    0,
  );
  physics.grab(
    { x: physics.positions[tip], y: physics.positions[tip + 1], z: physics.positions[tip + 2] },
    physics.positions,
  );
  expect(physics.grabOffset).toEqual(before);
  physics.update(1 / 120, surface.idle);
  expect(Math.abs(physics.offset[tip] - before[tip])).toBeLessThan(0.03);
  physics.release();
  for (let i = 0; i < 1200; i++) physics.update(1 / 120, surface.idle);
  expect(physics.awake).toBe(false);
  surface.geometry.dispose();
});
