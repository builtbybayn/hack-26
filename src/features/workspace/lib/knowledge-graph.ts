import { demoConnections, demoId } from "./dev-seed";
import type { WorkspaceData, SourceLocation } from "./models";
export type NodeType =
  "project" | "document" | "note" | "concept" | "claim" | "finding" | "annotation" | "draft";
export interface KnowledgeNode {
  id: string;
  type: NodeType;
  title: string;
  projectId: string;
  sourceId: string;
  summary: string;
  updatedAt: string;
  references: SourceLocation[];
}
export interface KnowledgeEdge {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  relationshipType: string;
  confidence?: number;
  explanation: string;
  origin: "explicit" | "inferred" | "seeded";
  evidenceReferences: SourceLocation[];
  reviewStatus: "suggested" | "confirmed" | "rejected" | "hidden";
}
export interface KnowledgeGraphData {
  nodes: KnowledgeNode[];
  edges: KnowledgeEdge[];
}
export const nodeId = (type: NodeType, id: string) => `${type}:${id}`;
export function buildKnowledgeGraph(data: WorkspaceData): KnowledgeGraphData {
  const nodes: KnowledgeNode[] = [],
    edges: KnowledgeEdge[] = [];
  const edgeIds = new Set<string>();
  const add = (
    type: NodeType,
    id: string,
    projectId: string,
    title: string,
    summary: string,
    updatedAt = "",
    references: SourceLocation[] = [],
  ) =>
    nodes.push({
      id: nodeId(type, id),
      type,
      sourceId: id,
      projectId,
      title,
      summary,
      updatedAt,
      references,
    });
  const link = (
    source: string,
    target: string,
    relationshipType: string,
    explanation: string,
    evidenceReferences: SourceLocation[] = [],
  ) => {
    const id = JSON.stringify([source, target, relationshipType]);
    if (!edgeIds.has(id)) {
      edgeIds.add(id);
      edges.push({
        id,
        sourceNodeId: source,
        targetNodeId: target,
        relationshipType,
        explanation,
        origin: "explicit",
        evidenceReferences,
        reviewStatus: "confirmed",
      });
    }
  };
  const located = (source: string, location?: SourceLocation) => {
    if (location)
      link(
        source,
        nodeId("document", location.documentId),
        "references",
        "Stored source reference.",
        [location],
      );
  };
  data.projects.forEach((x) => add("project", x.id, x.id, x.name, x.description, x.updatedAt));
  data.documents.forEach((x) =>
    add("document", x.id, x.projectId, x.title, x.summary, x.addedAt, [{ documentId: x.id }]),
  );
  data.notes.forEach((x) => {
    add("note", x.id, x.projectId, x.title, x.body, x.updatedAt, x.location ? [x.location] : []);
    const id = nodeId("note", x.id);
    located(id, x.location);
    if (x.conceptId)
      link(id, nodeId("concept", x.conceptId), "discusses", "Note has a stored concept link.");
    if (x.findingId)
      link(id, nodeId("finding", x.findingId), "builds-on", "Note has a stored finding link.");
  });
  data.concepts.forEach((x) => {
    const id = nodeId("concept", x.id);
    add("concept", x.id, x.projectId, x.name, x.why, "", [x.location]);
    located(id, x.location);
    x.requires.forEach((r) =>
      link(id, nodeId("concept", r), "requires", "Stored prerequisite relationship."),
    );
  });
  data.claims.forEach((x) => {
    add("claim", x.id, x.projectId, x.text, x.text, "", [x.location]);
    located(nodeId("claim", x.id), x.location);
  });
  data.findings.forEach((x) => {
    const id = nodeId("finding", x.id);
    add("finding", x.id, x.projectId, x.explanation, x.uncertainty, "", x.related);
    link(
      id,
      nodeId("claim", x.claimId),
      x.type,
      `Stored finding (${x.review}): ${x.explanation}`,
      x.related,
    );
    x.related.forEach((l) => located(id, l));
  });
  data.annotations.forEach((x) => {
    add("annotation", x.id, x.projectId, x.text || x.kind, x.text, x.createdAt, [x.location]);
    located(nodeId("annotation", x.id), x.location);
  });
  Object.values({ ...data.drafts, [data.draft.projectId]: data.draft }).forEach((x) => {
    add("draft", x.id, x.projectId, x.title || "Writing draft", x.abstract, x.updatedAt);
    x.citations.forEach((c) =>
      located(nodeId("draft", x.id), c.location || { documentId: c.documentId }),
    );
  });
  nodes
    .filter((n) => n.type !== "project")
    .forEach((n) =>
      link(nodeId("project", n.projectId), n.id, "owns", "Stored project ownership."),
    );
  demoConnections.forEach(([a, b, explanation]) => {
    link(
      nodeId("concept", demoId(a, "concept")),
      nodeId("concept", demoId(b, "concept")),
      "seeded-example",
      `TEST DATA — manually seeded suggestion, not AI analysis. ${explanation}`,
    );
    const edge = edges.at(-1)!;
    edge.origin = "seeded";
    edge.reviewStatus = "suggested";
  });
  const ids = new Set(nodes.map((n) => n.id));
  return { nodes, edges: edges.filter((e) => ids.has(e.sourceNodeId) && ids.has(e.targetNodeId)) };
}
export interface DiscoveryChunk {
  id: string;
  nodeId: string;
  text: string;
  reference?: SourceLocation;
  fingerprint: string;
}
export function discoveryChunks(data: WorkspaceData, graph: KnowledgeGraphData): DiscoveryChunk[] {
  const result: DiscoveryChunk[] = [];
  const append = (id: string, text: string, reference?: SourceLocation) => {
    for (let offset = 0; offset < text.length; offset += 2400) {
      const part = text.slice(offset, offset + 2400);
      result.push({
        id: JSON.stringify([id, reference?.documentId, reference?.passageId, offset]),
        nodeId: id,
        text: part,
        reference,
        fingerprint: `${id}:${offset}:${fingerprint(JSON.stringify([reference, part]))}`,
      });
    }
  };
  graph.nodes.forEach((n) => append(n.id, `${n.title}\n${n.summary}`, n.references[0]));
  data.documents.forEach((d) =>
    d.passages.forEach((p) =>
      append(nodeId("document", d.id), p.text, { documentId: d.id, passageId: p.id, page: p.page }),
    ),
  );
  return result;
}
// Only an explicitly configured authenticated research backend receives content.
export async function discoverRelationships(
  chunks: DiscoveryChunk[],
  graph: KnowledgeGraphData,
  signal: AbortSignal,
  corpus: DiscoveryChunk[] = chunks,
): Promise<KnowledgeEdge[]> {
  const base = process.env.NEXT_PUBLIC_RESEARCH_API_BASE;
  if (!base)
    throw new Error(
      "Semantic discovery requires a configured research backend. Explicit relationships are available.",
    );
  const response = await fetch(`${base}/knowledge-graph/discover`, {
    method: "POST",
    credentials: "include",
    signal,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chunks: chunks.map(({ id, nodeId, text, reference }) => ({ id, nodeId, text, reference })),
      activeChunkIds: corpus.map((c) => c.id),
      nodes: graph.nodes.map((n) => ({ id: n.id, projectId: n.projectId, type: n.type })),
    }),
  });
  if (!response.ok) throw new Error(`Semantic discovery failed (${response.status}).`);
  const payload: unknown = await response.json();
  const ids = new Set(graph.nodes.map((n) => n.id));
  if (
    !payload ||
    typeof payload !== "object" ||
    !("edges" in payload) ||
    !Array.isArray(payload.edges)
  )
    throw new Error("Invalid relationship response.");
  return payload.edges.map((value: unknown) => {
    if (!value || typeof value !== "object") throw new Error("Invalid relationship.");
    const e = value as KnowledgeEdge;
    if (
      !ids.has(e.sourceNodeId) ||
      !ids.has(e.targetNodeId) ||
      e.sourceNodeId === e.targetNodeId ||
      typeof e.confidence !== "number" ||
      !Number.isFinite(e.confidence) ||
      e.confidence < 0 ||
      e.confidence > 1 ||
      typeof e.explanation !== "string" ||
      !e.explanation.trim() ||
      typeof e.relationshipType !== "string" ||
      !e.relationshipType.trim() ||
      !Array.isArray(e.evidenceReferences)
    )
      throw new Error("Invalid relationship provenance.");
    const refs = e.evidenceReferences.filter((r) => dataReferenceValid(r, corpus));
    if (refs.length !== e.evidenceReferences.length)
      throw new Error("Provider returned an unknown source reference.");
    return {
      ...e,
      id: JSON.stringify([e.sourceNodeId, e.targetNodeId, e.relationshipType]),
      origin: "inferred" as const,
      reviewStatus: "suggested" as const,
      evidenceReferences: refs,
    };
  });
}
function dataReferenceValid(r: SourceLocation, chunks: DiscoveryChunk[]) {
  return chunks.some(
    (c) =>
      c.reference?.documentId === r.documentId &&
      (!r.passageId || c.reference.passageId === r.passageId) &&
      (!r.page || c.reference.page === r.page) &&
      (!r.quote || c.text.includes(r.quote)),
  );
}

function fingerprint(text: string) {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return (hash >>> 0).toString(36);
}
