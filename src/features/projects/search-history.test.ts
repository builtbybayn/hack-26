import { expect, it } from "vitest";
import type { ResearchProject } from "@/lib/browser-store";
import type { SavedTopicSearch } from "@/types/research";
import { addTopicSearch } from "./search-history";

it("keeps the newest 20 searches without changing older project data", () => {
  const search = (id: string): SavedTopicSearch => ({
    id,
    topic: id,
    createdAt: "2026-10-24T00:00:00.000Z",
    result: { recommendations: [], queries: [], warnings: [] },
  });
  const project = {
    id: "project",
    name: "Test",
    notes: "Keep this",
    papers: [],
    documentIds: [],
    updatedAt: "2026-10-23T00:00:00.000Z",
    searchHistory: Array.from({ length: 20 }, (_, index) => search(String(index))),
  } satisfies ResearchProject;
  const updated = addTopicSearch(project, search("new"));
  expect(updated.searchHistory?.map((entry) => entry.id)).toEqual([
    "new",
    ...project.searchHistory.slice(0, 19).map((entry) => entry.id),
  ]);
  expect(updated.notes).toBe("Keep this");
  expect(project.searchHistory).toHaveLength(20);
  expect(
    addTopicSearch({ ...project, searchHistory: undefined }, search("first")).searchHistory,
  ).toHaveLength(1);
});
