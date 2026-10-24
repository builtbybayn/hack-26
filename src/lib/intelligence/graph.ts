import type {
  Concept,
  Dependency,
  GraphRepair,
  KnowledgeGraph,
  ValidatedGraph,
} from "@/types/intelligence";

export function normalizeConceptIdentity(name: string): string {
  return name
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[’']s\b/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function validateGraph(graph: KnowledgeGraph): ValidatedGraph {
  const repairs: GraphRepair[] = [];
  const byIdentity = new Map<string, Concept>();
  const idMap = new Map<string, string>();
  for (const concept of graph.concepts) {
    const identity = normalizeConceptIdentity(concept.name) || normalizeConceptIdentity(concept.id);
    const existing = byIdentity.get(identity);
    if (existing) {
      idMap.set(concept.id, existing.id);
      existing.sourceReferences = uniqueReferences([
        ...existing.sourceReferences,
        ...concept.sourceReferences,
      ]);
      repairs.push({
        type: "duplicate",
        message: `Merged duplicate concept “${concept.name}” into “${existing.name}”.`,
      });
    } else {
      const normalized = { ...concept, id: identity || concept.id };
      byIdentity.set(identity, normalized);
      idMap.set(concept.id, normalized.id);
    }
  }
  const concepts = [...byIdentity.values()];
  const ids = new Set(concepts.map((concept) => concept.id));
  const dependencies: Dependency[] = [];
  const seenEdges = new Set<string>();
  for (const dependency of graph.dependencies) {
    const prerequisiteId = idMap.get(dependency.prerequisiteId) ?? dependency.prerequisiteId;
    const dependentId = idMap.get(dependency.dependentId) ?? dependency.dependentId;
    if (!ids.has(prerequisiteId) || !ids.has(dependentId) || prerequisiteId === dependentId) {
      repairs.push({
        type: "invalid-reference",
        message: `Removed invalid dependency ${prerequisiteId} → ${dependentId}.`,
      });
      continue;
    }
    const key = `${prerequisiteId}>${dependentId}`;
    if (!seenEdges.has(key)) {
      seenEdges.add(key);
      dependencies.push({ ...dependency, prerequisiteId, dependentId });
    }
  }

  while (true) {
    const cycle = findCycle(ids, dependencies);
    if (!cycle) break;
    const candidates = dependencies.filter(
      (edge) => cycle.includes(edge.prerequisiteId) && cycle.includes(edge.dependentId),
    );
    const removed =
      candidates.find((edge) => edge.evidenceType === "inferred") ??
      candidates[candidates.length - 1];
    dependencies.splice(dependencies.indexOf(removed), 1);
    repairs.push({
      type: "cycle",
      message: `Removed ${removed.evidenceType} dependency ${removed.prerequisiteId} → ${removed.dependentId} to repair a cycle.`,
    });
  }

  const topologicalOrder = topologicalSort(ids, dependencies);
  const inbound = new Set(dependencies.map((dependency) => dependency.dependentId));
  const foundationalConceptIds = topologicalOrder.filter((id) => !inbound.has(id));
  const downstreamCounts = Object.fromEntries(
    topologicalOrder.map((id) => [id, countDownstream(id, dependencies)]),
  );
  return {
    documentId: graph.documentId,
    concepts,
    dependencies,
    topologicalOrder,
    foundationalConceptIds,
    downstreamCounts,
    repairs,
  };
}

export function topologicalSort(idsInput: Iterable<string>, dependencies: Dependency[]): string[] {
  const ids = [...idsInput];
  const indegree = new Map(ids.map((id) => [id, 0]));
  const outgoing = new Map(ids.map((id) => [id, [] as string[]]));
  for (const edge of dependencies) {
    indegree.set(edge.dependentId, (indegree.get(edge.dependentId) ?? 0) + 1);
    outgoing.get(edge.prerequisiteId)?.push(edge.dependentId);
  }
  const queue = ids.filter((id) => indegree.get(id) === 0).sort();
  const result: string[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    result.push(id);
    for (const next of outgoing.get(id) ?? []) {
      indegree.set(next, indegree.get(next)! - 1);
      if (indegree.get(next) === 0) queue.push(next);
    }
    queue.sort();
  }
  return result;
}

function findCycle(ids: Set<string>, dependencies: Dependency[]): string[] | null {
  const outgoing = new Map([...ids].map((id) => [id, [] as string[]]));
  dependencies.forEach((edge) => outgoing.get(edge.prerequisiteId)?.push(edge.dependentId));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const path: string[] = [];
  const visit = (id: string): string[] | null => {
    if (visiting.has(id)) return path.slice(path.indexOf(id));
    if (visited.has(id)) return null;
    visiting.add(id);
    path.push(id);
    for (const next of outgoing.get(id) ?? []) {
      const cycle = visit(next);
      if (cycle) return cycle;
    }
    path.pop();
    visiting.delete(id);
    visited.add(id);
    return null;
  };
  for (const id of ids) {
    const cycle = visit(id);
    if (cycle) return cycle;
  }
  return null;
}

function countDownstream(start: string, dependencies: Dependency[]): number {
  const found = new Set<string>();
  const queue = [start];
  while (queue.length) {
    const id = queue.shift()!;
    for (const edge of dependencies.filter((item) => item.prerequisiteId === id)) {
      if (!found.has(edge.dependentId)) {
        found.add(edge.dependentId);
        queue.push(edge.dependentId);
      }
    }
  }
  return found.size;
}

function uniqueReferences(references: Concept["sourceReferences"]): Concept["sourceReferences"] {
  const seen = new Set<string>();
  return references.filter((reference) => {
    const key = `${reference.pageNumber}:${reference.sectionId ?? ""}:${reference.quote ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
