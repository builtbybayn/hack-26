import { notFound } from "next/navigation";
import { Suspense } from "react";
import type { Section } from "@/features/workspace/lib/models";

const sections: Section[] = [
  "graph",
  "overview",
  "news",
  "library",
  "reader",
  "roadmap",
  "evidence",
  "notes",
  "writing",
  "extension",
];

export function generateStaticParams() {
  return sections.map((section) => ({ section }));
}

/** The workspace shell (in the layout) renders the section; this only rejects unknown ones. */
export default function SectionPage({ params }: PageProps<"/[section]">) {
  return (
    <Suspense fallback={null}>
      <ValidateSection params={params} />
    </Suspense>
  );
}

async function ValidateSection({ params }: Pick<PageProps<"/[section]">, "params">) {
  const { section } = await params;
  if (!sections.includes(section as Section)) notFound();
  return null;
}
