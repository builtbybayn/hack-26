import { describe, expect, it } from "vitest";
import { routeWorkspaceTab } from "./workspace-routing";
import { EMPTY_WORKSPACE } from "./vault-service";
import type { Document, Note, WorkspaceData } from "./models";

const data: WorkspaceData = {
  ...EMPTY_WORKSPACE,
  activeProjectId: "project-a",
  documents: [
    { id: "paper-a", projectId: "project-a", status: "ready" } as Document,
    { id: "paper-b", projectId: "project-b", status: "ready" } as Document,
  ],
  notes: [{ id: "note-b", projectId: "project-b" } as Note],
};

describe("workspace navigation", () => {
  it("opens the extension's existing paper and page URL in the reader", () => {
    expect(
      routeWorkspaceTab("/", new URLSearchParams("paper=paper-b&page=12"), data),
    ).toMatchObject({
      section: "reader",
      documentId: "paper-b",
      passageId: "p12",
      contentProjectId: "project-b",
      projectId: "project-a",
    });
  });
  it("retains source ownership when opening cross-project notes", () => {
    expect(routeWorkspaceTab("/", new URLSearchParams("entry=note-b"), data)).toMatchObject({
      section: "notes",
      noteId: "note-b",
      contentProjectId: "project-b",
    });
  });
  it("does not substitute a different project's active paper for the reader", () => {
    expect(routeWorkspaceTab("/reader", new URLSearchParams(), data, "paper-b").documentId).toBe(
      "paper-a",
    );
  });
  it("preserves an explicit missing source, so the reader can report it instead of showing another paper", () => {
    expect(routeWorkspaceTab("/reader", new URLSearchParams("doc=missing"), data).documentId).toBe(
      "missing",
    );
  });
});
