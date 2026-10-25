/** Backend integration building blocks. Never import provider credentials into client code. */
import type { DiscoveryChunk, KnowledgeEdge } from "./knowledge-graph";
export type SemanticChunk = Omit<DiscoveryChunk, "fingerprint">;
export interface EmbeddingProvider {
  embed(texts: string[], signal: AbortSignal): Promise<number[][]>;
}
export interface RelationshipReasoner {
  explain(
    source: SemanticChunk,
    candidates: SemanticChunk[],
    signal: AbortSignal,
  ): Promise<Omit<KnowledgeEdge, "id" | "origin" | "reviewStatus">[]>;
}
export interface IndexedPassage {
  chunk: SemanticChunk;
  vector: number[];
}
/** Supply a tenant-scoped persistent implementation for production. */
export interface SemanticIndex {
  upsert(passages: IndexedPassage[], signal: AbortSignal): Promise<void>;
  prune(activeChunkIds: Set<string>, signal: AbortSignal): Promise<void>;
  nearest(
    vector: number[],
    excludeNodeId: string,
    limit: number,
    signal: AbortSignal,
  ): Promise<IndexedPassage[]>;
}
function assertVector(vector: number[]) {
  if (!vector.length || vector.some((v) => !Number.isFinite(v)))
    throw new Error("Embedding provider returned an invalid vector.");
}
export function cosineSimilarity(a: number[], b: number[]) {
  assertVector(a);
  assertVector(b);
  if (a.length !== b.length) throw new Error("Embedding dimensions do not match.");
  let dot = 0,
    aa = 0,
    bb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    aa += a[i] * a[i];
    bb += b[i] * b[i];
  }
  return aa && bb ? dot / Math.sqrt(aa * bb) : 0;
}
/** A real vector index suitable for small workspaces and integration tests.
 * Create one per authenticated workspace; do not share between tenants.
 */
export class MemorySemanticIndex implements SemanticIndex {
  private passages = new Map<string, IndexedPassage>();
  async upsert(passages: IndexedPassage[], signal: AbortSignal) {
    signal.throwIfAborted();
    passages.forEach((p) => {
      assertVector(p.vector);
      this.passages.set(p.chunk.id, p);
    });
  }
  async prune(ids: Set<string>, signal: AbortSignal) {
    signal.throwIfAborted();
    for (const id of this.passages.keys()) if (!ids.has(id)) this.passages.delete(id);
  }
  async nearest(vector: number[], excludeNodeId: string, limit: number, signal: AbortSignal) {
    signal.throwIfAborted();
    return [...this.passages.values()]
      .filter((p) => p.chunk.nodeId !== excludeNodeId)
      .map((p) => ({ p, score: cosineSimilarity(vector, p.vector) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((x) => x.p);
  }
}
/** Called by an authenticated backend route after permission checks.
 * Embeddings retrieve candidates; only the configured reasoner creates semantic
 * claims. Similar vectors alone are never presented as established relationships.
 */
export class SemanticDiscoveryEngine {
  constructor(
    private embeddings: EmbeddingProvider,
    private reasoner: RelationshipReasoner,
    private index: SemanticIndex,
  ) {}
  async discover(
    chunks: SemanticChunk[],
    activeChunkIds: string[],
    allowedNodeIds: Set<string>,
    signal: AbortSignal,
  ): Promise<KnowledgeEdge[]> {
    if (
      chunks.length > 24 ||
      chunks.some((c) => c.text.length > 2400 || !allowedNodeIds.has(c.nodeId))
    )
      throw new Error("Invalid discovery batch.");
    signal.throwIfAborted();
    await this.index.prune(new Set(activeChunkIds), signal);
    if (!chunks.length) return [];
    const vectors = await this.embeddings.embed(
      chunks.map((c) => c.text),
      signal,
    );
    if (vectors.length !== chunks.length)
      throw new Error("Embedding provider returned the wrong number of vectors.");
    vectors.forEach(assertVector);
    await this.index.upsert(
      chunks.map((chunk, i) => ({ chunk, vector: vectors[i] })),
      signal,
    );
    const edges = new Map<string, KnowledgeEdge>();
    for (let i = 0; i < chunks.length; i++) {
      signal.throwIfAborted();
      const source = chunks[i];
      const candidates = (await this.index.nearest(vectors[i], source.nodeId, 8, signal)).filter(
        (p) => allowedNodeIds.has(p.chunk.nodeId),
      );
      if (!candidates.length) continue;
      const inferred = await this.reasoner.explain(
        source,
        candidates.map((p) => p.chunk),
        signal,
      );
      const candidateIds = new Set(candidates.map((p) => p.chunk.nodeId));
      for (const edge of inferred) {
        if (
          edge.sourceNodeId !== source.nodeId ||
          !candidateIds.has(edge.targetNodeId) ||
          typeof edge.confidence !== "number" ||
          !Number.isFinite(edge.confidence) ||
          edge.confidence < 0 ||
          edge.confidence > 1 ||
          !edge.explanation?.trim() ||
          !edge.relationshipType?.trim()
        )
          throw new Error("Reasoner returned an invalid relationship.");
        const passages = [source, ...candidates.map((p) => p.chunk)];
        if (
          !Array.isArray(edge.evidenceReferences) ||
          edge.evidenceReferences.some(
            (ref) =>
              !passages.some(
                (p) =>
                  p.reference?.documentId === ref.documentId &&
                  (!ref.passageId || p.reference.passageId === ref.passageId) &&
                  (!ref.page || p.reference.page === ref.page) &&
                  (!ref.quote || p.text.includes(ref.quote)),
              ),
          )
        )
          throw new Error("Reasoner returned unsupported evidence.");
        const id = JSON.stringify([edge.sourceNodeId, edge.targetNodeId, edge.relationshipType]);
        edges.set(id, { ...edge, id, origin: "inferred", reviewStatus: "suggested" });
      }
    }
    return [...edges.values()];
  }
}
