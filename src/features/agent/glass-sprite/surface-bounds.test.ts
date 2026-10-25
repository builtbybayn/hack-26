import { describe, expect, it } from "vitest";
import { Matrix4, PerspectiveCamera, Vector3 } from "three";
import { containSurface, aiVisualRectangle } from "./surface-bounds";
import { createSurface } from "./surface.js";
import { LiquidInteraction } from "./liquid-interaction.js";
const bounds = { left: -0.9, right: 0.9, top: 0.8, bottom: -0.8 };
describe("anchored liquid containment", () => {
  it("keeps the origin fixed and smoothly limits a connected field in all directions", () => {
    const base = new Float64Array([0, 0, 0, -0.2, -0.2, 0, 0.2, 0.2, 0]);
    for (const [x, y] of [
      [-3, 0],
      [3, 0],
      [0, -3],
      [0, 3],
    ]) {
      const p = Float64Array.from(base);
      p[3] += x;
      p[4] += y;
      p[6] += x;
      p[7] += y;
      const scale = containSurface(base, p, new Matrix4().elements, bounds);
      expect(scale).toBeGreaterThan(0);
      expect(scale).toBeLessThan(1);
      expect(Array.from(p.slice(0, 3))).toEqual([0, 0, 0]);
      for (let i = 0; i < p.length; i += 3) {
        expect(p[i]).toBeGreaterThanOrEqual(bounds.left);
        expect(p[i]).toBeLessThanOrEqual(bounds.right);
        expect(p[i + 1]).toBeGreaterThanOrEqual(bounds.bottom);
        expect(p[i + 1]).toBeLessThanOrEqual(bounds.top);
      }
    }
  });
  it("accounts for perspective, depth, and changing sidebar aspect ratio", () => {
    for (const aspect of [0.3, 0.5, 1]) {
      const camera = new PerspectiveCamera(30, aspect, 0.1, 100);
      camera.position.z = 20;
      camera.updateMatrixWorld();
      const model = new Matrix4().makeTranslation(0, -2, 0);
      const matrix = new Matrix4()
        .multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
        .multiply(model);
      const base = new Float64Array([0, 0, 0, -0.4, 0.4, 0.5, 0.4, 0.4, 0.5]);
      const p = Float64Array.from(base);
      p[3] -= 4;
      p[4] += 12;
      p[5] += 2;
      p[6] += 4;
      p[7] += 12;
      p[8] += 2;
      containSurface(base, p, matrix.elements, bounds);
      for (let i = 0; i < p.length; i += 3) {
        const projected = new Vector3().fromArray(p, i).applyMatrix4(matrix);
        expect(projected.x).toBeGreaterThanOrEqual(bounds.left);
        expect(projected.x).toBeLessThanOrEqual(bounds.right);
        expect(projected.y).toBeGreaterThanOrEqual(bounds.bottom);
        expect(projected.y).toBeLessThanOrEqual(bounds.top);
      }
    }
  });
  it("leaves ordinary in-bounds ripples unchanged", () => {
    const base = new Float64Array([0, 0, 0, -0.2, -0.2, 0, 0.2, 0.2, 0]);
    const p = new Float64Array([0, 0, 0, -0.3, -0.1, 0, 0.3, 0.3, 0]);
    const before = p.slice();
    expect(containSurface(base, p, new Matrix4().elements, bounds)).toBe(1);
    expect(p).toEqual(before);
  });
  it("permits longer sidebar pulls while the fixed body transform stays unchanged", () => {
    const surface = createSurface();
    const liquid = new LiquidInteraction(surface);
    liquid.pullLimit = 8;
    liquid.maxStrain = 9;
    liquid.grab({ x: 0, y: 1.52, z: 0 }, surface.idle);
    liquid.move({ x: 0, y: 8, z: 0 });
    for (let i = 0; i < 180; i++) liquid.update(1 / 120, surface.idle);
    expect(liquid.positions.every(Number.isFinite)).toBe(true);
    expect(Math.max(...liquid.positions)).toBeGreaterThan(2.5);
    liquid.release();
    for (let i = 0; i < 1200; i++) liquid.update(1 / 120, surface.idle);
    expect(liquid.awake).toBe(false);
    surface.geometry.dispose();
  });
});

describe("dedicated AI visual rectangle", () => {
  const sidebar = { left: 48, right: 348, top: 0, bottom: 800 };
  const area = { left: 48, right: 347, top: 480, bottom: 760 };
  const footer = { left: 48, right: 347, top: 760, bottom: 800 };
  it("excludes the explorer above and the footer below in production", () => {
    expect(aiVisualRectangle(area, sidebar, null, footer)).toEqual({
      left: 54,
      right: 341,
      top: 486,
      bottom: 754,
    });
  });
  it("stops before all animation testing controls, expanded or collapsed", () => {
    for (const top of [710, 620]) {
      const controls = { left: 60, right: 335, top, bottom: 760 };
      const rect = aiVisualRectangle(area, sidebar, controls, footer);
      expect(rect.top).toBe(486);
      expect(rect.bottom).toBe(top - 6);
      expect(rect.bottom).toBeLessThan(footer.top);
    }
  });
  it("recalculates the rectangle when the sidebar and AI area resize", () => {
    const narrow = { left: 48, right: 268, top: 0, bottom: 640 };
    const resizedArea = { left: 48, right: 267, top: 380, bottom: 600 };
    const rect = aiVisualRectangle(resizedArea, narrow, null, {
      left: 48,
      right: 268,
      top: 600,
      bottom: 640,
    });
    expect(rect).toEqual({ left: 54, right: 261, top: 386, bottom: 594 });
  });
});

it("increases edge resistance smoothly without exceeding the mesh rectangle", () => {
  const base = new Float64Array([0, 0, 0, 0.2, 0, 0]);
  const rectangle = { left: -1, right: 1, top: 1, bottom: -1 };
  const tip = (pull: number) => {
    const p = base.slice();
    p[3] += pull;
    containSurface(base, p, new Matrix4().elements, rectangle);
    expect(p[3]).toBeLessThan(1);
    expect(p[0]).toBe(0);
    return p[3];
  };
  const travel = [0.1, 0.4, 0.55, 0.56, 0.7, 0.8, 1, 2, 10].map(tip);
  expect(tip(0.1)).toBeCloseTo(0.3);
  expect(travel).toEqual([...travel].sort((a, b) => a - b));
  expect(tip(0.81) - tip(0.8)).toBeLessThan(tip(0.21) - tip(0.2));
  expect(tip(0.80001) - tip(0.79999)).toBeLessThan(0.00003);
});
