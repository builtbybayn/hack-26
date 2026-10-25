import type { Metadata } from "next";
import { DocumentIntelligence } from "@/features/document-intelligence/DocumentIntelligence";

export const metadata: Metadata = { title: "Fluid Research · Classic workspace" };

/** The original single-page workspace (concept map, quizzes). The vault at `/` replaces it. */
export default function ClassicPage() {
  return <DocumentIntelligence />;
}
