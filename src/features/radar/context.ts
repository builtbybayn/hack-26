import type { WorkspaceData } from "@/features/workspace/lib/models";
import type { ResearchContext } from "@/types/radar";

/** Only short project metadata is sent; document pages and note bodies stay in the browser. */
export function buildRadarContext(data: WorkspaceData): ResearchContext | null {
  const project = data.projects.find((item) => item.id === data.activeProjectId);
  if (!project || project.id === "loading") return null;
  const description = project.description.trim();
  return {
    projectId: project.id,
    projectTitle: project.name,
    projectSummary: description || project.name,
    researchGoals: description ? [description.slice(0, 160)] : [],
    keyConcepts: data.concepts
      .filter((item) => item.projectId === project.id)
      .slice(0, 12)
      .map((item) => item.name),
    researchQuestions: data.notes
      .filter((item) => item.projectId === project.id && item.question)
      .slice(0, 5)
      .map((item) => item.title),
    knownChallenges: [],
    constraints: [],
    sourceDocumentIds: data.documents
      .filter((item) => item.projectId === project.id && item.status === "ready")
      .slice(0, 30)
      .map((item) => item.id),
  };
}
