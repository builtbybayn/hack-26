import type { ResearchProject } from "@/lib/browser-store";
import type { SavedTopicSearch } from "@/types/research";

export function addTopicSearch(
  project: ResearchProject,
  search: SavedTopicSearch,
): ResearchProject {
  return {
    ...project,
    searchHistory: [search, ...(project.searchHistory ?? [])].slice(0, 20),
    updatedAt: search.createdAt,
  };
}
