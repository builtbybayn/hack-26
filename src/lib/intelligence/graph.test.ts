import { describe, expect, it } from "vitest";
import type { KnowledgeGraph } from "@/types/intelligence";
import { buildLearningPath } from "./learning-path";
import { validateGraph } from "./graph";

const concept = (id: string, name = id) => ({
  id,
  name,
  description: `${name} description`,
  difficulty: "beginner" as const,
  estimatedMinutes: 10,
  sourceReferences: [],
});

describe("graph validation", () => {
  it("merges duplicate concepts and removes invalid references", () => {
    const graph: KnowledgeGraph = {
      documentId: "doc",
      concepts: [concept("vectors", "Vector Algebra"), concept("vector-algebra", "vector algebra")],
      dependencies: [
        {
          prerequisiteId: "missing",
          dependentId: "vectors",
          evidenceType: "inferred",
          rationale: "Invalid",
        },
      ],
    };
    const result = validateGraph(graph);
    expect(result.concepts).toHaveLength(1);
    expect(result.dependencies).toHaveLength(0);
    expect(result.repairs.map((repair) => repair.type)).toEqual(["duplicate", "invalid-reference"]);
  });

  it("repairs cycles, preferring to remove inferred edges", () => {
    const graph: KnowledgeGraph = {
      documentId: "doc",
      concepts: [concept("a"), concept("b"), concept("c")],
      dependencies: [
        { prerequisiteId: "a", dependentId: "b", evidenceType: "source", rationale: "source" },
        { prerequisiteId: "b", dependentId: "c", evidenceType: "source", rationale: "source" },
        { prerequisiteId: "c", dependentId: "a", evidenceType: "inferred", rationale: "inference" },
      ],
    };
    const result = validateGraph(graph);
    expect(result.dependencies).toHaveLength(2);
    expect(result.topologicalOrder).toHaveLength(3);
    expect(result.repairs.find((repair) => repair.type === "cycle")?.message).toContain("inferred");
  });

  it("builds a mastery-aware path that prioritizes blockers", () => {
    const graph = validateGraph({
      documentId: "doc",
      concepts: [concept("a"), concept("b"), concept("c")],
      dependencies: [
        { prerequisiteId: "a", dependentId: "b", evidenceType: "source", rationale: "" },
        { prerequisiteId: "b", dependentId: "c", evidenceType: "source", rationale: "" },
      ],
    });
    expect(buildLearningPath(graph)[0].conceptId).toBe("a");
    expect(buildLearningPath(graph, { a: "mastered" }).map((item) => item.conceptId)).not.toContain(
      "a",
    );
  });
});
