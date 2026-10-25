"use client";

import type { ReactNode } from "react";
import { FlaskConical, PanelRight, Plus, X } from "lucide-react";
import type { VaultEntry } from "@/types/vault";
import { KindIcon } from "./SidePanes";
import { RESEARCH_VIEW_ID, type WorkspaceAction, type WorkspaceState } from "./workspace-state";

interface WorkspaceProps {
  state: WorkspaceState;
  dispatch: (action: WorkspaceAction) => void;
  byId: Map<string, VaultEntry>;
  rightOpen: boolean;
  onToggleRight: () => void;
  /** `entryId` is set without `entry` for built-in views such as research projects. */
  renderView: (entry: VaultEntry | null, paneId: string, entryId: string | null) => ReactNode;
}

/** The work area: one or two panes, each with Obsidian-style tabs. */
export function Workspace({
  state,
  dispatch,
  byId,
  rightOpen,
  onToggleRight,
  renderView,
}: WorkspaceProps) {
  return (
    <div className="workspace-panes" data-panes={state.panes.length}>
      {state.panes.map((pane, paneIndex) => {
        const activeTab = pane.tabs.find((tab) => tab.id === pane.activeTabId) ?? pane.tabs[0];
        const activeEntry = activeTab?.entryId ? (byId.get(activeTab.entryId) ?? null) : null;
        const isLast = paneIndex === state.panes.length - 1;
        return (
          <section
            key={pane.id}
            className="workspace-leaf"
            data-active={pane.id === state.activePaneId || undefined}
            aria-label={paneIndex === 0 ? "Main pane" : "Right pane"}
            onMouseDownCapture={() => {
              if (pane.id !== state.activePaneId) dispatch({ type: "focus-pane", paneId: pane.id });
            }}
          >
            <div className="workspace-tab-header-container">
              <div className="workspace-tab-header-container-inner" role="tablist">
                {pane.tabs.map((tab) => {
                  const entry = tab.entryId ? byId.get(tab.entryId) : undefined;
                  const title =
                    entry?.name ??
                    (tab.entryId === RESEARCH_VIEW_ID ? "Research projects" : "New tab");
                  return (
                    <div
                      key={tab.id}
                      className="workspace-tab-header"
                      data-active={tab.id === pane.activeTabId || undefined}
                      role="tab"
                      aria-selected={tab.id === pane.activeTabId}
                      tabIndex={0}
                      title={title}
                      onClick={() => dispatch({ type: "activate", paneId: pane.id, tabId: tab.id })}
                      onAuxClick={(event) => {
                        if (event.button === 1)
                          dispatch({ type: "close", paneId: pane.id, tabId: tab.id });
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter")
                          dispatch({ type: "activate", paneId: pane.id, tabId: tab.id });
                      }}
                    >
                      {entry && <KindIcon entry={entry} />}
                      {tab.entryId === RESEARCH_VIEW_ID && <FlaskConical size={14} aria-hidden />}
                      <span className="workspace-tab-header-inner-title">{title}</span>
                      <button
                        type="button"
                        className="workspace-tab-header-inner-close-button"
                        aria-label={`Close ${title}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          dispatch({ type: "close", paneId: pane.id, tabId: tab.id });
                        }}
                      >
                        <X size={14} />
                      </button>
                    </div>
                  );
                })}
                <button
                  type="button"
                  className="clickable-icon workspace-tab-header-new-tab"
                  aria-label="New tab"
                  title="New tab"
                  onClick={() => dispatch({ type: "new-tab", paneId: pane.id })}
                >
                  <Plus size={16} />
                </button>
              </div>
              {isLast && (
                <button
                  type="button"
                  className="clickable-icon sidebar-toggle-button"
                  aria-label={rightOpen ? "Collapse right sidebar" : "Expand right sidebar"}
                  aria-pressed={rightOpen}
                  title={rightOpen ? "Collapse right sidebar" : "Expand right sidebar"}
                  onClick={onToggleRight}
                >
                  <PanelRight size={18} />
                </button>
              )}
            </div>
            <div className="workspace-leaf-content">
              {renderView(activeEntry, pane.id, activeTab?.entryId ?? null)}
            </div>
          </section>
        );
      })}
    </div>
  );
}
