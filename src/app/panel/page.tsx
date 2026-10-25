import type { Metadata } from "next";
import { ExtensionPanel } from "@/features/extension-panel/ExtensionPanel";

export const metadata: Metadata = { title: "KnowBefore · Panel" };

/** The Chrome extension's side panel (loaded in an iframe by extension/sidepanel.html). */
export default function PanelPage() {
  return <ExtensionPanel />;
}
