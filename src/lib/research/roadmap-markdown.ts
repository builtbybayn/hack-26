/**
 * Formats a research roadmap as the vault's "Roadmap" note: a checklist of concepts and papers,
 * stage by stage. Browser-safe and pure.
 */
import type { PaperRecord } from "@/types/research";
import type { Roadmap } from "@/types/roadmap";

export function roadmapToMarkdown(roadmap: Roadmap): string {
  // The note itself is titled "Roadmap", so the body starts with the goal (no repeated heading).
  const lines = [`> ${roadmap.goal}`, "", roadmap.summary];
  roadmap.stages.forEach((stage, index) => {
    lines.push("", `## ${index + 1}. ${stage.title}`, "", stage.goal, "", "**Concepts to learn**");
    for (const concept of stage.concepts) lines.push(`- [ ] **${concept.name}**: ${concept.why}`);
    lines.push("", "**Papers to read**");
    if (stage.papers.length)
      for (const paper of stage.papers) lines.push(`- [ ] ${paperLine(paper)}`);
    else lines.push(`- No papers found yet. Search for “${stage.searchQuery}”.`);
  });
  const date = roadmap.generatedAt.slice(0, 10);
  lines.push(
    "",
    "---",
    "",
    `*Planned with KnowBefore on ${date}. Concepts are AI-suggested; papers come from OpenAlex.*`,
  );
  return lines.join("\n");
}

function paperLine(paper: PaperRecord): string {
  const author = paper.authors[0]
    ? `${paper.authors[0].split(" ").at(-1)}${paper.authors.length > 1 ? " et al." : ""}`
    : null;
  const byline = [author, paper.year].filter(Boolean).join(", ");
  // Brackets in a title would break the link syntax.
  const title = paper.title.replace(/[[\]]/g, "");
  return [
    `[${title}](${paper.url})`,
    byline ? ` (${byline})` : "",
    paper.openAccessPdfUrl ? ` · [PDF](${paper.openAccessPdfUrl})` : "",
  ].join("");
}
