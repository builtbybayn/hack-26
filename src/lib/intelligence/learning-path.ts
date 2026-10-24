import type { LearningPathItem, MasteryLevel, ValidatedGraph } from "@/types/intelligence";

export function buildLearningPath(
  graph: ValidatedGraph,
  mastery: Record<string, MasteryLevel> = {},
): LearningPathItem[] {
  const orderIndex = new Map(graph.topologicalOrder.map((id, index) => [id, index]));
  return graph.concepts
    .filter((concept) => mastery[concept.id] !== "mastered")
    .map((concept) => {
      const blocked = graph.downstreamCounts[concept.id] ?? 0;
      const prerequisiteCount = graph.dependencies.filter(
        (edge) => edge.dependentId === concept.id,
      ).length;
      const priority = blocked * 100 - (orderIndex.get(concept.id) ?? 0) * 2 - prerequisiteCount;
      return {
        conceptId: concept.id,
        priority,
        blockedConceptCount: blocked,
        reason:
          blocked > 0
            ? `Unlocks ${blocked} downstream concept${blocked === 1 ? "" : "s"}.`
            : "Completes the document learning sequence.",
      };
    })
    .sort(
      (a, b) =>
        b.priority - a.priority ||
        (orderIndex.get(a.conceptId) ?? 0) - (orderIndex.get(b.conceptId) ?? 0),
    );
}
