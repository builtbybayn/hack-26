"use client";
import { useId, useState } from "react";
import { Check, GitBranch, List, Save, Split, Workflow } from "lucide-react";
import { useWorkspace } from "@/features/workspace/lib/workspace-context";
import { findingLabel } from "@/features/workspace/lib/service";
import type { Concept, EvidenceFinding, SourceLocation } from "@/features/workspace/lib/models";
import { Empty, PageHeading, SourceLink, Status } from "./shared";
import Link from "next/link";
import { MarkdownContent } from "../markdown-content";

export function RoadmapView({ conceptId }: { conceptId?: string } = {}) {
  const statusId = useId();
  const { data, service, setNotice } = useWorkspace();
  const project = data.projects.find((item) => item.id === data.activeProjectId);
  const [view, setView] = useState<"tree" | "list">("tree");
  const [selectedId, setSelectedId] = useState(conceptId || "divergence");
  const concepts = data.concepts
    .filter((item) => item.projectId === data.activeProjectId)
    .sort((a, b) => a.order - b.order);
  const selected = concepts.find((item) => item.id === selectedId) || concepts[0];
  const next = concepts.find((item) => item.status !== "understood");
  const plannedRoadmap = data.notes.find(
    (note) => note.projectId === data.activeProjectId && note.title === "Roadmap",
  );
  if (!selected)
    return (
      <>
        <PageHeading
          eyebrow="KNOWLEDGE ROADMAP"
          title={
            plannedRoadmap
              ? `${project?.name || "Research"} · Roadmap`
              : "Discover the prerequisites."
          }
          description={
            plannedRoadmap
              ? "Your learning path, from foundations to the research frontier."
              : "Prerequisite analysis appears here when a source has been processed."
          }
        />
        {plannedRoadmap ? (
          <section className="surface workspace-note-card workspace-roadmap-card">
            <MarkdownContent source={plannedRoadmap.body} roadmap />
            <Link
              className="btn mt-4"
              href={`/notes?note=${encodeURIComponent(plannedRoadmap.id)}`}
            >
              Open roadmap note
            </Link>
          </section>
        ) : (
          <Empty
            title="No concepts yet"
            detail="Add a source to this project. Backend prerequisite analysis will create a located learning path."
          />
        )}
      </>
    );
  return (
    <>
      <PageHeading
        eyebrow="KNOWLEDGE ROADMAP"
        title="Knowledge roadmap"
        description=""
        action={
          <div className="flex gap-2">
            <button
              className={`btn ${view === "tree" ? "border-neutral text-neutral" : ""}`}
              onClick={() => setView("tree")}
              aria-pressed={view === "tree"}
            >
              <GitBranch size={15} /> Tree
            </button>
            <button
              className={`btn ${view === "list" ? "border-neutral text-neutral" : ""}`}
              onClick={() => setView("list")}
              aria-pressed={view === "list"}
            >
              <List size={15} /> List
            </button>
          </div>
        }
      />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(280px,1fr)]">
        <section className="surface rounded-xl p-5 md:p-7">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <p className="eyebrow">SUGGESTED SEQUENCE</p>
              <p className="mt-1 text-sm text-muted">
                {concepts.filter((item) => item.status === "understood").length} of{" "}
                {concepts.length} understood
              </p>
            </div>
            <Workflow size={20} className="text-neutral" />
          </div>
          {view === "tree" ? (
            <div className="space-y-3">
              {concepts.map((concept, index) => (
                <div key={concept.id} className={`relative ${index ? "ml-4 sm:ml-8" : ""}`}>
                  <button
                    className={`flex w-full items-center gap-3 rounded-lg border p-4 text-left transition-colors ${selected.id === concept.id ? "border-[#363636] bg-[#262626]" : "border-line bg-[#1e1e1e] hover:border-[#363636]"}`}
                    onClick={() => setSelectedId(concept.id)}
                  >
                    <span
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-xs ${concept.status === "understood" ? "border-neutral text-neutral" : "border-[#363636] text-neutral"}`}
                    >
                      {concept.status === "understood" ? (
                        <Check size={15} />
                      ) : (
                        String(index + 1).padStart(2, "0")
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <strong className="block text-sm">{concept.name}</strong>
                      <small className="mt-1 block text-xs text-muted">
                        {concept.requires.length
                          ? `After ${concept.requires.map((id) => concepts.find((item) => item.id === id)?.name).join(" + ")}`
                          : "Starting point"}
                      </small>
                    </span>
                    <Status status={concept.origin} />
                  </button>
                  {index < concepts.length - 1 && (
                    <div className="absolute -bottom-3 left-8 h-3 border-l border-[#363636]" />
                  )}
                </div>
              ))}
            </div>
          ) : (
            <ol className="space-y-2">
              {concepts.map((concept) => (
                <li key={concept.id}>
                  <button
                    className={`flex w-full items-center justify-between rounded-lg border p-4 text-left ${selected.id === concept.id ? "border-neutral bg-[#262626]" : "border-line hover:bg-raised"}`}
                    onClick={() => setSelectedId(concept.id)}
                  >
                    <span>
                      <strong className="text-sm">
                        {concept.order}. {concept.name}
                      </strong>
                      <span className="mt-1 block text-xs text-muted">
                        Prerequisites:{" "}
                        {concept.requires.length
                          ? concept.requires
                              .map((id) => concepts.find((item) => item.id === id)?.name)
                              .join(", ")
                          : "none"}
                      </span>
                    </span>
                    <Status status={concept.status} />
                  </button>
                </li>
              ))}
            </ol>
          )}
        </section>
        <div className="space-y-5">
          <section className="surface rounded-xl p-6">
            <p className="eyebrow">CONCEPT DETAIL</p>
            <h2 className="mt-2 text-xl font-semibold">{selected.name}</h2>
            <details className="research-details">
              <summary>Concept details & prerequisites</summary>
              <div className="mt-5 space-y-4 text-sm">
                <div>
                  <span className="text-xs font-semibold tracking-wider text-neutral uppercase">
                    Why it matters
                  </span>
                  <p className="mt-1 leading-relaxed text-[#d4d4d4]">{selected.why}</p>
                </div>
                <div>
                  <span className="text-xs font-semibold tracking-wider text-neutral uppercase">
                    Quick refresher
                  </span>
                  <p className="mt-1 leading-relaxed text-[#d4d4d4]">{selected.refresher}</p>
                </div>
                <div>
                  <span className="text-xs font-semibold tracking-wider text-neutral uppercase">
                    Needed by source
                  </span>
                  <div className="mt-2">
                    <SourceLink location={selected.location} />
                  </div>
                </div>
                <div>
                  <span className="text-xs font-semibold tracking-wider text-neutral uppercase">
                    Depends on
                  </span>
                  <p className="mt-1 text-[#d4d4d4]">
                    {selected.requires.length
                      ? selected.requires
                          .map((id) => concepts.find((item) => item.id === id)?.name)
                          .join(", ")
                      : "No earlier concepts in this path."}
                  </p>
                </div>
              </div>
            </details>
            <label className="mt-6 block text-xs text-muted" htmlFor={statusId}>
              Your learning status
            </label>
            <select
              id={statusId}
              className="input mt-2"
              value={selected.status}
              onChange={(event) =>
                void service
                  .setConceptStatus(selected.id, event.target.value as Concept["status"])
                  .then(() => setNotice("Learning status saved."))
              }
            >
              <option value="to-learn">To learn</option>
              <option value="learning">Learning</option>
              <option value="understood">Understood</option>
            </select>
            <p className="mt-3 text-xs text-muted">
              Gap origin: {selected.origin}. You control your learning status.
            </p>
          </section>
          <section className="rounded-xl border border-[#363636] bg-[#1e1e1e] p-5">
            <p className="eyebrow">UP NEXT</p>
            <p className="mt-2 text-sm font-semibold">{next?.name || "Roadmap complete"}</p>
            <p className="mt-1 text-xs text-muted">
              {next?.why || "All current concepts are marked understood."}
            </p>
          </section>
        </div>
      </div>
    </>
  );
}

function PassageCard({ title, location }: { title: string; location: SourceLocation }) {
  const { data } = useWorkspace();
  const doc = data.documents.find((item) => item.id === location.documentId);
  const passage = doc?.passages.find((item) => item.id === location.passageId);
  return (
    <div className="surface rounded-xl p-5">
      <p className="eyebrow">{title}</p>
      <h3 className="mt-2 text-sm font-semibold">{doc?.title}</h3>
      <p className="mt-2 text-xs text-muted">
        {doc?.authors.join(", ")} · {doc?.year}
        {doc?.demo ? " · Fictional demo source" : ""}
      </p>
      <blockquote className="mt-5 border-l-2 border-[#363636] pl-4 font-[Georgia,serif] text-sm leading-relaxed text-[#d4d4d4]">
        “{location.quote || passage?.text || "Passage unavailable."}”
      </blockquote>
      <div className="mt-4">
        <SourceLink location={location} />
      </div>
    </div>
  );
}
export function EvidenceView({
  findingId,
  claimId,
}: { findingId?: string; claimId?: string } = {}) {
  const { data, service, setNotice } = useWorkspace();
  const [selectedId, setSelectedId] = useState(
    findingId || data.findings.find((f) => f.claimId === claimId)?.id || data.findings[0]?.id || "",
  );
  const findings = data.findings.filter((item) => item.projectId === data.activeProjectId);
  const selected =
    findings.find((item) => item.id === selectedId && (!claimId || item.claimId === claimId)) ||
    (claimId ? findings.find((item) => item.claimId === claimId) : findings[0]);
  const claim = data.claims.find((item) => item.id === (claimId || selected?.claimId));
  async function save(finding: EvidenceFinding) {
    try {
      await service.saveNote({
        projectId: data.activeProjectId,
        title: `Evidence review: ${findingLabel(finding.type)}`,
        body: `${claim?.text}\n\n${finding.explanation}\n\nUncertainty: ${finding.uncertainty}`,
        location: finding.related[0],
        findingId: finding.id,
        question: false,
        resolved: false,
      });
      await service.setFindingSaved(finding.id, true);
      setNotice("Finding saved as a linked note.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not save finding.");
    }
  }
  return (
    <>
      <PageHeading eyebrow="ASSUMPTIONS & EVIDENCE" title="Assumptions & evidence" description="" />
      {selected ? (
        <div className="grid gap-6 xl:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="surface h-fit rounded-xl p-4">
            <p className="eyebrow mb-4">FINDINGS · {findings.length}</p>
            {findings.map((item) => (
              <button
                key={item.id}
                onClick={() => setSelectedId(item.id)}
                className={`mb-2 block w-full rounded-lg border p-3 text-left ${item.id === selected.id ? "border-[#363636] bg-[#262626]" : "border-line hover:bg-raised"}`}
              >
                <span className="tag text-neutral">{findingLabel(item.type)}</span>
                <p className="mt-2 text-sm">
                  {data.claims.find((claim) => claim.id === item.claimId)?.text}
                </p>
                <p className="mt-2 text-xs leading-relaxed text-muted">{item.explanation}</p>
                <Status status={item.review} />
              </button>
            ))}
          </aside>
          <div className="space-y-5">
            <section className="rounded-xl border border-[#363636] bg-[#1e1e1e] p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="eyebrow">CLAIM UNDER REVIEW</p>
                  <h2 className="mt-2 max-w-2xl text-xl leading-snug font-semibold">
                    {claim?.text}
                  </h2>
                </div>
                <Status status={selected.review} />
              </div>
              <div className="mt-4">{claim && <SourceLink location={claim.location} />}</div>
              <div className="mt-5 border-t border-[#363636] pt-4">
                <p className="text-xs font-semibold tracking-wider text-neutral uppercase">
                  Assumptions / experimental conditions
                </p>
                {claim?.assumptions.map((item) => (
                  <div key={item.id} className="mt-2 text-sm text-[#d4d4d4]">
                    {item.text} <SourceLink location={item.location}>View condition</SourceLink>
                  </div>
                ))}
              </div>
            </section>
            <details className="research-details">
              <summary>Supporting source passages</summary>
              <div className="grid gap-4 md:grid-cols-2">
                {selected.related.map((location, index) => (
                  <PassageCard
                    key={`${location.documentId}-${index}`}
                    title={index === 0 ? "SOURCE A · CLAIM" : "SOURCE B · COMPARISON"}
                    location={location}
                  />
                ))}
              </div>
            </details>
            <section className="surface rounded-xl p-6">
              <div className="flex flex-wrap items-center gap-3">
                <Split size={18} className="text-neutral" />
                <span className="tag border-[#363636] text-neutral-bright">
                  {findingLabel(selected.type)}
                </span>
              </div>
              <p className="mt-4 text-sm leading-relaxed text-[#d4d4d4]">{selected.explanation}</p>
              <p className="mt-3 text-xs leading-relaxed text-muted">
                <strong className="text-[#999999]">Uncertainty:</strong> {selected.uncertainty}
              </p>
              <button
                className="btn btn-primary mt-5"
                onClick={() => void save(selected)}
                disabled={selected.saved}
              >
                <Save size={15} />
                {selected.saved ? "Saved to notes" : "Save finding to notes"}
              </button>
            </section>
            <div className="grid gap-2 text-xs text-muted sm:grid-cols-2">
              {(
                [
                  "supporting",
                  "potential-contradiction",
                  "different-conditions",
                  "insufficient",
                ] as const
              ).map((type) => (
                <span key={type} className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-neutral" />
                  {findingLabel(type)}
                </span>
              ))}
            </div>
          </div>
        </div>
      ) : claim ? (
        <section className="surface rounded-xl p-6">
          <h2 className="text-xl">{claim.text}</h2>
          <div className="mt-4">
            <SourceLink location={claim.location} />
          </div>
          <p className="mt-4 text-sm text-muted">No evidence findings are stored for this claim.</p>
          {claim.assumptions.map((item) => (
            <p key={item.id} className="mt-3">
              {item.text} <SourceLink location={item.location} />
            </p>
          ))}
        </section>
      ) : (
        <div className="surface rounded-xl p-8 text-sm text-muted">
          No findings yet. Add sources and ask the assistant to compare a claim.
        </div>
      )}
    </>
  );
}
