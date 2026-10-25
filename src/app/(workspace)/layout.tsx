import { Suspense } from "react";
import Workspace from "@/features/workspace/components/workspace";
import { WorkspaceProvider } from "@/features/workspace/lib/workspace-context";
import "@/features/workspace/workspace.css";

/** The research workspace: every section shares one shell, provider, and assistant. */
export default function WorkspaceLayout({ children }: LayoutProps<"/">) {
  return (
    <WorkspaceProvider>
      <Suspense fallback={<div className="welcome-screen">Opening workspace…</div>}>
        <Workspace />
      </Suspense>
      {children}
    </WorkspaceProvider>
  );
}
