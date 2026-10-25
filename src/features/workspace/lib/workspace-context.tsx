"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import type { ResearchService } from "./service";
import type { AssistantMessage, SourceLocation, WorkspaceData } from "./models";
import { EMPTY_WORKSPACE } from "./vault-service";
import { workspaceService as service } from "./service-instance";

interface ContextValue {
  service: ResearchService;
  data: WorkspaceData;
  assistantOpen: boolean;
  setAssistantOpen: (open: boolean) => void;
  scope: AssistantMessage["scope"];
  setScope: (scope: AssistantMessage["scope"]) => void;
  selection?: SourceLocation;
  setSelection: (location?: SourceLocation) => void;
  queuedPrompt?: { id: string; text: string };
  setQueuedPrompt: (prompt?: { id: string; text: string }) => void;
  activeDocumentId: string;
  setActiveDocumentId: (id: string) => void;
  notice: string;
  setNotice: (message: string) => void;
  createNote: () => Promise<void>;
}
const Context = createContext<ContextValue | null>(null);
export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const data = useSyncExternalStore(service.subscribe, service.snapshot, () => EMPTY_WORKSPACE);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [scope, setScope] = useState<AssistantMessage["scope"]>("project");
  const [selection, setSelection] = useState<SourceLocation>();
  const [queuedPrompt, setQueuedPrompt] = useState<{ id: string; text: string }>();
  const [activeDocumentId, setActiveDocumentId] = useState("");
  const [notice, setNotice] = useState("");
  const createNote = useCallback(async () => {
    if (data.activeProjectId === "loading") return;
    try {
      const note = await service.saveNote({
        projectId: data.activeProjectId,
        title: "Untitled",
        body: "",
        question: false,
        resolved: false,
      });
      router.push(`/notes?note=${encodeURIComponent(note.id)}`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not create note.");
    }
  }, [data.activeProjectId, router]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 4500);
    return () => clearTimeout(timer);
  }, [notice]);
  return (
    <Context.Provider
      value={{
        service,
        data,
        assistantOpen,
        setAssistantOpen,
        scope,
        setScope,
        selection,
        setSelection,
        queuedPrompt,
        setQueuedPrompt,
        activeDocumentId,
        setActiveDocumentId,
        notice,
        setNotice,
        createNote,
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useWorkspace() {
  const value = useContext(Context);
  if (!value) throw new Error("WorkspaceProvider is missing");
  return value;
}

// Scope an opened research item without changing the global project or either split panel.
export function WorkspaceItemScope({
  projectId,
  children,
}: {
  projectId?: string;
  children: ReactNode;
}) {
  const parent = useWorkspace();
  const draft = projectId ? parent.data.drafts[projectId] : undefined;
  const draftId = draft?.id;
  const scopedService = useMemo(
    () =>
      new Proxy(parent.service, {
        get(target, key) {
          if (key === "saveDraft")
            return (patch: Partial<import("./models").Draft>) => {
              if (!draftId)
                return Promise.reject(new Error("No writing draft exists for this project."));
              return target.saveDraft({ ...patch, id: draftId, projectId });
            };
          const value = Reflect.get(target, key);
          return typeof value === "function" ? value.bind(target) : value;
        },
      }),
    [parent.service, projectId, draftId],
  );
  if (!projectId || projectId === parent.data.activeProjectId) return children;
  return (
    <Context.Provider
      value={{
        ...parent,
        service: scopedService,
        data: {
          ...parent.data,
          activeProjectId: projectId,
          draft: draft || parent.data.draft,
          conversation: parent.data.conversations[projectId] || parent.data.conversation,
        },
      }}
    >
      {children}
    </Context.Provider>
  );
}
