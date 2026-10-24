import type { Metadata } from "next";
import { ExtensionPanel } from "@/features/extension-panel/ExtensionPanel";

export const metadata: Metadata = { title: "KnowBefore · Panel" };

/** Compact page loaded inside the Chrome extension's side panel. Temporary test UI. */
export default function PanelPage() {
  return <ExtensionPanel />;
}
