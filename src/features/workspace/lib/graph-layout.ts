import type { KnowledgeNode, KnowledgeEdge } from "./knowledge-graph";
export type GraphPoint = { x: number; y: number; vx: number; vy: number };
export interface GraphLayout {
  points: Map<string, GraphPoint>;
  centers: Map<string, { x: number; y: number }>;
  targets: Map<string, { x: number; y: number }>;
}
export function createGraphLayout(nodes: KnowledgeNode[]): GraphLayout {
  const projects = [...new Set(nodes.map((n) => n.projectId))].sort();
  const columns = Math.ceil(Math.sqrt(projects.length));
  const rows = Math.ceil(projects.length / columns);
  const centers = new Map<string, { x: number; y: number }>(),
    points = new Map<string, GraphPoint>(),
    targets = new Map<string, { x: number; y: number }>();
  projects.forEach((id, i) =>
    centers.set(id, {
      x:
        ((i % columns) -
          (Math.min(columns, projects.length - Math.floor(i / columns) * columns) - 1) / 2) *
        410,
      y: (Math.floor(i / columns) - (rows - 1) / 2) * 360,
    }),
  );
  for (const id of projects) {
    const center = centers.get(id)!;
    const members = nodes
      .filter((n) => n.projectId === id)
      .sort((a, b) => a.id.localeCompare(b.id));
    let index = 0;
    for (const n of members) {
      const angle = index * 2.3999632297,
        radius = n.type === "project" ? 0 : 43 + 21 * Math.sqrt(++index);
      const target = {
        x: center.x + Math.cos(angle) * radius,
        y: center.y + Math.sin(angle) * radius,
      };
      targets.set(n.id, target);
      points.set(n.id, { ...target, vx: 0, vy: 0 });
    }
  }
  return { points, centers, targets };
}
export function stepGraphLayout(
  layout: GraphLayout,
  nodes: KnowledgeNode[],
  edges: KnowledgeEdge[],
  held?: string,
) {
  const { points, targets } = layout,
    byId = new Map(nodes.map((n) => [n.id, n]));
  const bins = new Map<string, GraphPoint[]>();
  for (const n of nodes) {
    const p = points.get(n.id)!;
    const key = `${Math.floor(p.x / 80)},${Math.floor(p.y / 80)}`;
    const bucket = bins.get(key) || [];
    bucket.push(p);
    bins.set(key, bucket);
  }
  for (const n of nodes) {
    const p = points.get(n.id)!,
      target = targets.get(n.id)!;
    p.vx += (target.x - p.x) * (n.type === "project" ? 0.085 : 0.009);
    p.vy += (target.y - p.y) * (n.type === "project" ? 0.085 : 0.009);
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++)
        for (const q of bins.get(`${Math.floor(p.x / 80) + dx},${Math.floor(p.y / 80) + dy}`) ||
          []) {
          if (p === q) continue;
          const x = p.x - q.x,
            y = p.y - q.y,
            d = Math.max(1, Math.hypot(x, y));
          const force = 24 / (d * d) + Math.max(0, 30 - d) * 0.045;
          p.vx += (x / d) * force;
          p.vy += (y / d) * force;
        }
  }
  for (const e of edges) {
    const a = points.get(e.sourceNodeId),
      b = points.get(e.targetNodeId);
    if (!a || !b) continue;
    // Cross-project links never collapse the project islands into one hairball.
    const cross = byId.get(e.sourceNodeId)?.projectId !== byId.get(e.targetNodeId)?.projectId;
    const dx = b.x - a.x,
      dy = b.y - a.y,
      d = Math.hypot(dx, dy) || 1;
    const force = cross
      ? Math.min(0.025, d * 0.000015)
      : (d - (e.relationshipType === "owns" ? 110 : 65)) * 0.004;
    a.vx += (dx / d) * force;
    a.vy += (dy / d) * force;
    b.vx -= (dx / d) * force;
    b.vy -= (dy / d) * force;
  }
  let motion = 0;
  for (const n of nodes) {
    const p = points.get(n.id)!;
    if (n.id === held) {
      p.vx = p.vy = 0;
      continue;
    }
    p.vx *= 0.72;
    p.vy *= 0.72;
    p.x += Math.max(-3, Math.min(3, p.vx));
    p.y += Math.max(-3, Math.min(3, p.vy));
    motion += p.vx * p.vx + p.vy * p.vy;
  }
  return motion;
}
export function fitGraphPoints(points: { x: number; y: number }[], w: number, h: number) {
  if (!points.length) return { x: 0, y: 0, z: 1 };
  const minX = Math.min(...points.map((p) => p.x)),
    maxX = Math.max(...points.map((p) => p.x)),
    minY = Math.min(...points.map((p) => p.y)),
    maxY = Math.max(...points.map((p) => p.y));
  const z = Math.max(
    0.15,
    Math.min(
      1.8,
      (Math.max(100, w) - 90) / (maxX - minX + 160),
      (Math.max(100, h) - 90) / (maxY - minY + 120),
    ),
  );
  return { x: (-(minX + maxX) / 2) * z, y: (-(minY + maxY) / 2) * z, z };
}
