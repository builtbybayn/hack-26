import * as THREE from "three";
import { VISUAL } from "./visual-settings.js";

export function createSurface(subdivisions = VISUAL.subdivisions) {
  const original = new THREE.IcosahedronGeometry(VISUAL.radius, 0);
  const source = original.attributes.position.array;
  const positions = [],
    indices = [],
    unique = [],
    renderToUnique = [],
    weldedIndices = [];
  const lookup = new Map();
  const a = new THREE.Vector3(),
    b = new THREE.Vector3(),
    c = new THREE.Vector3();
  for (let face = 0; face < 20; face++) {
    a.fromArray(source, face * 9);
    b.fromArray(source, face * 9 + 3);
    c.fromArray(source, face * 9 + 6);
    const rows = [];
    for (let i = 0; i <= subdivisions; i++) {
      rows[i] = [];
      for (let j = 0; j <= subdivisions - i; j++) {
        const v = i / subdivisions,
          w = j / subdivisions,
          u = 1 - v - w;
        const x = a.x * u + b.x * v + c.x * w;
        const y = a.y * u + b.y * v + c.y * w;
        const z = a.z * u + b.z * v + c.z * w;
        const scale = VISUAL.radius / Math.hypot(x, y, z);
        const point = [x * scale, y * scale, z * scale];
        const key = point.map((value) => Math.round(value * 1e6)).join(",");
        let id = lookup.get(key);
        if (id === undefined) {
          id = unique.length / 3;
          lookup.set(key, id);
          unique.push(...point);
        }
        rows[i][j] = positions.length / 3;
        positions.push(...point);
        renderToUnique.push(id);
      }
    }
    for (let i = 0; i < subdivisions; i++)
      for (let j = 0; j < subdivisions - i; j++) {
        const triangle = (x, y, z) => {
          indices.push(x, y, z);
          weldedIndices.push(renderToUnique[x], renderToUnique[y], renderToUnique[z]);
        };
        triangle(rows[i][j], rows[i + 1][j], rows[i][j + 1]);
        if (j < subdivisions - i - 1) triangle(rows[i + 1][j], rows[i + 1][j + 1], rows[i][j + 1]);
      }
  }
  original.dispose();
  const geometry = new THREE.BufferGeometry();
  geometry.setIndex(indices);
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage),
  );
  geometry.setAttribute(
    "normal",
    new THREE.Float32BufferAttribute(
      positions.map((value) => value / VISUAL.radius),
      3,
    ).setUsage(THREE.DynamicDrawUsage),
  );
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 5);
  const idle = new Float64Array(unique),
    directions = new Float64Array(unique.length);
  for (let i = 0; i < idle.length; i++) directions[i] = idle[i] / VISUAL.radius;
  const surface = {
    geometry,
    idle,
    directions,
    renderToUnique: new Uint32Array(renderToUnique),
    indices: new Uint32Array(weldedIndices),
    normals: new Float64Array(unique.length),
  };
  surface.volume = measureVolume(idle, surface.indices);
  return surface;
}

export function measureVolume(p, indices) {
  let volume6 = 0;
  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i] * 3,
      b = indices[i + 1] * 3,
      c = indices[i + 2] * 3;
    volume6 +=
      p[a] * (p[b + 1] * p[c + 2] - p[b + 2] * p[c + 1]) +
      p[a + 1] * (p[b + 2] * p[c] - p[b] * p[c + 2]) +
      p[a + 2] * (p[b] * p[c + 1] - p[b + 1] * p[c]);
  }
  return volume6 / 6;
}

export class BlobSurface {
  constructor(surface) {
    this.surface = surface;
  }

  sample(time, state, reactionAge, out, interaction = {}) {
    const directions = this.surface.directions;
    const active = state === "researching" ? 1 : state === "error" ? 2 : 0;
    const recoil = active ? -0.065 * Math.exp(-reactionAge * 2.2) * Math.sin(reactionAge * 7) : 0;
    for (let i = 0; i < directions.length; i += 3) {
      const x = directions[i],
        y = directions[i + 1],
        z = directions[i + 2];
      const breath = 0.016 * Math.sin(time * (active === 1 ? 2.2 : 0.95));
      const calm =
        0.014 * Math.sin(2.6 * x + 1.8 * z - time * 0.75) * Math.sin(2.2 * y + time * 0.63);
      const drift = active
        ? 0
        : 0.027 *
            Math.sin(2.1 * x + 1.6 * y + time * 0.43 + 0.6 * Math.sin(time * 0.19)) *
            Math.sin(1.9 * z - time * 0.37) +
          0.012 * Math.sin(5.2 * y + 2.7 * z - time * 1.13) * Math.sin(3.1 * x + time * 0.71);
      const flow = active
        ? 0.052 *
          Math.sin(3.4 * x + 1.5 * y - time * 2.3) *
          Math.sin(2.8 * z - 1.3 * y + time * 1.7)
        : 0;
      const traveling = active
        ? 0.018 * Math.sin(7 * y + 3 * z - time * 4.1) * Math.sin(3 * x + time * 1.3)
        : 0;
      const tension =
        active === 2
          ? 0.032 *
            Math.sin(4.2 * x + 2.8 * y - time * 4.9) *
            Math.sin(3.7 * z - 2.4 * x + time * 4.6)
          : 0;
      const projection = x * (interaction.x || 0) + y * (interaction.y || 0);
      const stretch =
        (interaction.stretch || 0) +
        (interaction.impulse || 0) *
          Math.exp(-(interaction.age || 0) * 2.4) *
          Math.sin((interaction.age || 0) * 15);
      const ripple =
        (interaction.ripple || 0) *
        Math.sin(projection * 24 - time * 5) *
        Math.exp(-Math.abs(projection) * 1.7);
      const r =
        VISUAL.radius *
        (1 +
          breath +
          calm +
          drift +
          flow +
          traveling +
          tension +
          recoil +
          stretch * 0.055 * (projection * projection - 0.2) +
          ripple * 0.012);
      out[i] = x * r;
      out[i + 1] = y * r;
      out[i + 2] = z * r;
    }
  }
}

export function uploadSurface(surface, p) {
  const { indices, normals, renderToUnique, geometry } = surface;
  normals.fill(0);
  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i] * 3,
      b = indices[i + 1] * 3,
      c = indices[i + 2] * 3;
    const ux = p[b] - p[a],
      uy = p[b + 1] - p[a + 1],
      uz = p[b + 2] - p[a + 2];
    const vx = p[c] - p[a],
      vy = p[c + 1] - p[a + 1],
      vz = p[c + 2] - p[a + 2];
    const nx = uy * vz - uz * vy,
      ny = uz * vx - ux * vz,
      nz = ux * vy - uy * vx;
    normals[a] += nx;
    normals[a + 1] += ny;
    normals[a + 2] += nz;
    normals[b] += nx;
    normals[b + 1] += ny;
    normals[b + 2] += nz;
    normals[c] += nx;
    normals[c + 1] += ny;
    normals[c + 2] += nz;
  }
  for (let i = 0; i < normals.length; i += 3) {
    const inv = 1 / Math.max(1e-12, Math.hypot(normals[i], normals[i + 1], normals[i + 2]));
    normals[i] *= inv;
    normals[i + 1] *= inv;
    normals[i + 2] *= inv;
  }
  const positions = geometry.attributes.position.array,
    outputNormals = geometry.attributes.normal.array;
  for (let i = 0; i < renderToUnique.length; i++) {
    const source = renderToUnique[i] * 3,
      dest = i * 3;
    positions[dest] = p[source];
    positions[dest + 1] = p[source + 1];
    positions[dest + 2] = p[source + 2];
    outputNormals[dest] = normals[source];
    outputNormals[dest + 1] = normals[source + 1];
    outputNormals[dest + 2] = normals[source + 2];
  }
  geometry.attributes.position.needsUpdate = true;
  geometry.attributes.normal.needsUpdate = true;
}
