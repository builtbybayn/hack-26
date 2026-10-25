import { Markdown } from "@/features/vault/Markdown";

/** Shared reading typography for saved notes and the planned roadmap view. */
export function MarkdownContent({
  source,
  roadmap = false,
}: {
  source: string;
  roadmap?: boolean;
}) {
  return (
    <div
      className={[
        "markdown-rendered",
        "workspace-markdown",
        roadmap ? "roadmap-document" : "",
      ].join(" ")}
    >
      <Markdown source={source} />
    </div>
  );
}
