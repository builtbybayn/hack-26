"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Background, Controls, ReactFlow, type Edge, type Node } from "@xyflow/react";
import type {
  Concept,
  Dependency,
  DocumentAnalysis,
  EvidenceFeedback,
  EvidenceVerdict,
  ExplainResult,
  MasteryLevel,
  PipelineStage,
  QuizResult,
} from "@/types/intelligence";
import type { ParsedDocument } from "@/types/ingestion";
import { ResearchProjects } from "@/features/projects/ResearchProjects";
import {
  analyzeDocument,
  evaluateAnswers,
  parseDocument,
  requestExplanation,
  requestQuiz,
} from "@/lib/api/intelligence-client";
import { buildLearningPath } from "@/lib/intelligence/learning-path";
import {
  evidenceAgreement,
  evidenceEvaluationCases,
  evidenceFeedbackId,
  verifyAnalysisReferences,
} from "@/lib/intelligence/source-evidence";
import {
  deleteEvidenceFeedback,
  getDocumentRecord,
  listEvidenceFeedback,
  loadLatestDocument,
  loadMastery,
  saveDocument,
  saveEvidenceFeedback,
  saveMastery,
} from "@/lib/browser-store";
import { ContradictionPanel } from "@/features/contradictions/ContradictionPanel";
import { ListenButton } from "@/features/voice/ListenButton";
import { ReadAloudPanel } from "@/features/voice/ReadAloudPanel";

const STAGE_LABELS: Record<PipelineStage, string> = {
  extracting: "Extracting PDF locally",
  ocr: "Running consented advanced OCR",
  concepts: "Identifying concepts and prerequisites",
  prerequisites: "Generating prerequisite relationships",
  validating: "Validating the graph",
  "learning-path": "Building your learning path",
  completed: "Analysis complete",
  failed: "Analysis failed",
};

export function DocumentIntelligence() {
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<"automatic" | "standard" | "advanced">("automatic");
  const [provider, setProvider] = useState<"mistral" | "mathpix">("mistral");
  const [consent, setConsent] = useState(false);
  const [document, setDocument] = useState<ParsedDocument | null>(null);
  const [analysis, setAnalysis] = useState<DocumentAnalysis | null>(null);
  const [mastery, setMastery] = useState<Record<string, MasteryLevel>>({});
  const [selectedConcept, setSelectedConcept] = useState<Concept | null>(null);
  const [selectedDependency, setSelectedDependency] = useState<Dependency | null>(null);
  const [selectedPage, setSelectedPage] = useState<number | null>(null);
  const [stage, setStage] = useState<PipelineStage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [explanation, setExplanation] = useState<ExplainResult | string | null>(null);
  const [feedback, setFeedback] = useState<Record<string, EvidenceFeedback>>({});
  const [feedbackError, setFeedbackError] = useState<string | null>(null);
  const [quiz, setQuiz] = useState<QuizResult | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [quizFeedback, setQuizFeedback] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const explanationRequestId = useRef(0);
  const pdfUrl = useMemo(
    () => (file?.type === "application/pdf" ? URL.createObjectURL(file) : null),
    [file],
  );

  useEffect(() => {
    const requestedId = new URLSearchParams(window.location.search).get("document");
    Promise.all([
      loadMastery(),
      requestedId ? getDocumentRecord(requestedId) : loadLatestDocument(),
    ])
      .then(([savedMastery, record]) => {
        setMastery(savedMastery);
        if (requestedId && !record) setError("This document is no longer stored in this browser.");
        if (record?.analysis) {
          const verified = verifyAnalysisReferences(record.document, record.analysis);
          setDocument(record.document);
          setAnalysis(verified);
          setSelectedConcept(verified.graph.concepts[0] ?? null);
          setStage("completed");
          if (verified !== record.analysis)
            void saveDocument(record.document, verified).catch(() => undefined);
        }
      })
      .catch(() => undefined);
  }, []);
  useEffect(
    () => () => {
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    },
    [pdfUrl],
  );

  const learningPath = useMemo(
    () => (analysis ? buildLearningPath(analysis.graph, mastery) : []),
    [analysis, mastery],
  );
  const graphElements = useMemo(
    () => (analysis ? layoutGraph(analysis, mastery) : { nodes: [], edges: [] }),
    [analysis, mastery],
  );
  const review = useMemo(() => evidenceAgreement(Object.values(feedback)), [feedback]);

  async function runAnalysis() {
    if (!file) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setError(null);
    setAnalysis(null);
    setSelectedConcept(null);
    setExplanation(null);
    setFeedback({});
    explanationRequestId.current += 1;
    setStage(mode === "advanced" ? "ocr" : "extracting");
    try {
      const parsed = await parseDocument(
        file,
        { mode, ocrProvider: provider, allowExternalProcessing: consent },
        controller.signal,
      );
      if (!parsed.ok) throw new Error(parsed.error.message);
      const parsedDocument = parsed.data.document;
      setDocument(parsedDocument);
      setStage("concepts");
      // Reuse a stored analysis of the same file (same content hash) instead of calling Gemini.
      let documentAnalysis = (await getDocumentRecord(parsedDocument.id))?.analysis;
      if (documentAnalysis)
        // Keep the parsed paper even if analysis fails, so read-aloud and the extension can use it.
        await saveDocument(parsedDocument, documentAnalysis ?? null);
      if (!documentAnalysis) {
        const analyzed = await analyzeDocument(
          { document: parsedDocument, mastery },
          controller.signal,
        );
        if (!analyzed.ok) throw new Error(analyzed.error.message);
        documentAnalysis = analyzed.data.analysis;
      }
      documentAnalysis = verifyAnalysisReferences(parsedDocument, documentAnalysis);
      setStage("validating");
      setAnalysis(documentAnalysis);
      await saveDocument(parsedDocument, documentAnalysis);
      setStage("learning-path");
      setSelectedConcept(documentAnalysis.graph.concepts[0] ?? null);
      setStage("completed");
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "AbortError") return;
      setError(caught instanceof Error ? caught.message : "Analysis failed.");
      setStage("failed");
    }
  }

  async function updateMastery(conceptId: string, level: MasteryLevel) {
    setMastery((current) => ({ ...current, [conceptId]: level }));
    await saveMastery(conceptId, level);
  }

  async function explain(style: "beginner" | "technical" | "analogy" | "worked-example") {
    if (!document || !selectedConcept) return;
    const requestId = ++explanationRequestId.current;
    setFeedbackError(null);
    setExplanation("Loading a contextual explanation…");
    const result = await requestExplanation({ document, concept: selectedConcept, style });
    if (requestId === explanationRequestId.current) {
      setExplanation(result.ok ? result.data : result.error.message);
      try {
        const saved = await listEvidenceFeedback(document.id);
        if (requestId === explanationRequestId.current)
          setFeedback(Object.fromEntries(saved.map((entry) => [entry.id, entry])));
      } catch {
        setFeedbackError("Saved corrections could not be loaded.");
      }
    }
  }

  async function correctEvidence(
    section: ExplainResult["sections"][number],
    verdict: EvidenceVerdict | "",
  ) {
    if (!document || !section.sourceReference || !section.evidence) return;
    const id = evidenceFeedbackId(document.id, section.text, section.sourceReference);
    setFeedbackError(null);
    try {
      if (!verdict) {
        await deleteEvidenceFeedback(id);
        setFeedback((current) => {
          const next = { ...current };
          delete next[id];
          return next;
        });
      } else {
        const entry: EvidenceFeedback = {
          id,
          documentId: document.id,
          claim: section.text,
          pageNumber: section.sourceReference.pageNumber,
          quote: section.sourceReference.quote,
          aiVerdict: section.evidence.verdict,
          correctedVerdict: verdict,
          updatedAt: new Date().toISOString(),
        };
        await saveEvidenceFeedback(entry);
        setFeedback((current) => ({ ...current, [id]: entry }));
      }
    } catch {
      setFeedbackError("The correction could not be saved.");
    }
  }

  function exportEvidenceReviews() {
    if (!document) return;
    const cases = evidenceEvaluationCases(document, Object.values(feedback));
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(cases, null, 2)], {
        type: "application/json",
      }),
    );
    const link = window.document.createElement("a");
    link.href = url;
    link.download = "evidence-reviews.json";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  function selectConcept(concept: Concept | null) {
    explanationRequestId.current += 1;
    setSelectedConcept(concept);
    setExplanation(null);
    setSelectedPage(null);
  }

  async function startQuiz() {
    if (!selectedConcept) return;
    setQuizFeedback(null);
    setAnswers({});
    const result = await requestQuiz(selectedConcept);
    if (result.ok) setQuiz(result.data);
    else setQuizFeedback(result.error.message);
  }

  async function submitQuiz() {
    if (!selectedConcept || !quiz) return;
    const result = await evaluateAnswers({ quiz, answers });
    if (!result.ok) {
      setQuizFeedback(result.error.message);
      return;
    }
    setQuizFeedback(`${result.data.score}% — ${result.data.feedback}`);
    await updateMastery(selectedConcept.id, result.data.mastery);
  }

  return (
    <main className="app-shell">
      <header className="masthead">
        <div>
          <span className="eyebrow">KNOWBEFORE</span>
          <h1>See what comes before understanding.</h1>
        </div>
        <p>
          Turn a dense academic PDF into a grounded prerequisite map and a learning sequence built
          around what you already know.
        </p>
      </header>
      <section className="upload-card" aria-labelledby="upload-title">
        <div>
          <span className="step">01 · DOCUMENT</span>
          <h2 id="upload-title">Upload and parse</h2>
          <p>PDF.js runs locally first. Advanced OCR is only used with your permission.</p>
        </div>
        <label className="drop-zone">
          <input
            type="file"
            accept=".pdf,application/pdf"
            onChange={(event) => {
              setFile(event.target.files?.[0] ?? null);
              setDocument(null);
              setAnalysis(null);
            }}
          />
          <span>{file ? file.name : "Choose a PDF"}</span>
          <small>
            {file
              ? `${(file.size / 1024 / 1024).toFixed(2)} MB`
              : "Academic papers, textbooks, lecture notes · up to 25 MB"}
          </small>
        </label>
        <div className="settings-row">
          <label>
            Parsing method
            <select value={mode} onChange={(e) => setMode(e.target.value as typeof mode)}>
              <option value="automatic">Automatic</option>
              <option value="standard">Standard (PDF.js)</option>
              <option value="advanced">Advanced OCR</option>
            </select>
          </label>
          <label>
            OCR provider
            <select
              value={provider}
              disabled={mode === "standard"}
              onChange={(e) => setProvider(e.target.value as typeof provider)}
            >
              <option value="mistral">Mistral</option>
              <option value="mathpix">Mathpix</option>
            </select>
          </label>
          <label className="consent">
            <input
              type="checkbox"
              checked={consent}
              disabled={mode === "standard"}
              onChange={(e) => setConsent(e.target.checked)}
            />
            <span>Allow external OCR when requested or needed</span>
          </label>
          <button
            className="primary"
            disabled={
              !file ||
              (mode === "advanced" && !consent) ||
              (!!stage && !["completed", "failed"].includes(stage))
            }
            onClick={runAnalysis}
          >
            Analyze document
          </button>
          {stage && !["completed", "failed"].includes(stage) && (
            <button className="secondary" onClick={() => abortRef.current?.abort()}>
              Cancel
            </button>
          )}
        </div>
        {stage && (
          <div className={`status ${stage}`}>
            <span className="status-dot" />
            {STAGE_LABELS[stage]}
          </div>
        )}
        {error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}
      </section>

      {document && (
        <section className="document-strip">
          <div>
            <span>DOCUMENT</span>
            <strong>{document.title ?? document.source.fileName}</strong>
          </div>
          <div>
            <span>PAGES</span>
            <strong>{document.metadata.pageCount ?? document.pages.length}</strong>
          </div>
          <div>
            <span>PARSER</span>
            <strong>{document.provenance.parser}</strong>
          </div>
          <div>
            <span>QUALITY</span>
            <strong>{Math.round((document.extractionQuality?.score ?? 1) * 100)}%</strong>
          </div>
        </section>
      )}
      {document && (
        <ReadAloudPanel
          key={document.id}
          document={document}
          onOpenPage={pdfUrl ? setSelectedPage : undefined}
        />
      )}

      <ResearchProjects document={document} analysis={analysis} />

      {analysis && (
        <>
          <section className="insight-grid">
            <article className="subject-card">
              <span className="step">02 · UNDERSTANDING</span>
              <h2>{analysis.understanding.subject}</h2>
              <p>
                {analysis.understanding.learningObjectives[0] ??
                  "Explore the prerequisite structure below."}
              </p>
              <div className="chips">
                {analysis.understanding.topics.slice(0, 8).map((topic) => (
                  <span key={topic}>{topic}</span>
                ))}
              </div>
            </article>
            <article className="path-card">
              <span className="step">03 · YOUR PATH</span>
              <h2>{learningPath.length} concepts to review</h2>
              <ol>
                {learningPath.slice(0, 6).map((item, index) => {
                  const concept = analysis.graph.concepts.find(
                    (entry) => entry.id === item.conceptId,
                  )!;
                  return (
                    <li key={item.conceptId}>
                      <button onClick={() => selectConcept(concept)}>
                        <b>{String(index + 1).padStart(2, "0")}</b>
                        <span>
                          {concept.name}
                          <small>{item.reason}</small>
                        </span>
                        <em>{concept.estimatedMinutes} min</em>
                      </button>
                    </li>
                  );
                })}
              </ol>
            </article>
          </section>
          <section className="workspace">
            <div className="graph-panel">
              <div className="panel-heading">
                <div>
                  <span className="step">04 · KNOWLEDGE GRAPH</span>
                  <h2>Prerequisite landscape</h2>
                </div>
                <div className="legend">
                  <span>
                    <i className="line source" />
                    Source
                  </span>
                  <span>
                    <i className="line inferred" />
                    Inferred
                  </span>
                </div>
              </div>
              {analysis.graph.repairs.some((repair) => repair.type === "unverified-quote") && (
                <details>
                  <summary>Some source references could not be verified</summary>
                  <ul>
                    {analysis.graph.repairs
                      .filter((repair) => repair.type === "unverified-quote")
                      .map((repair, index) => (
                        <li key={index}>{repair.message}</li>
                      ))}
                  </ul>
                </details>
              )}
              <div className="flow">
                <ReactFlow
                  nodes={graphElements.nodes}
                  edges={graphElements.edges}
                  fitView
                  minZoom={0.35}
                  maxZoom={1.6}
                  onNodeClick={(_, node) =>
                    selectConcept(
                      analysis.graph.concepts.find((concept) => concept.id === node.id) ?? null,
                    )
                  }
                  onEdgeClick={(_, edge) =>
                    setSelectedDependency(
                      analysis.graph.dependencies.find(
                        (dependency) =>
                          `${dependency.prerequisiteId}-${dependency.dependentId}` === edge.id,
                      ) ?? null,
                    )
                  }
                >
                  <Background color="#d8d4cb" gap={24} />
                  <Controls showInteractive={false} />
                </ReactFlow>
              </div>
            </div>
            <aside className="detail-panel">
              {selectedConcept ? (
                <>
                  <span className="step">CONCEPT</span>
                  <h2>{selectedConcept.name}</h2>
                  <p>{selectedConcept.description}</p>
                  <div className="concept-meta">
                    <span>{selectedConcept.difficulty}</span>
                    <span>{selectedConcept.estimatedMinutes} min</span>
                    <select
                      aria-label="Mastery"
                      value={mastery[selectedConcept.id] ?? "unknown"}
                      onChange={(e) =>
                        updateMastery(selectedConcept.id, e.target.value as MasteryLevel)
                      }
                    >
                      <option value="unknown">Not assessed</option>
                      <option value="learning">Learning</option>
                      <option value="mastered">Mastered</option>
                    </select>
                  </div>
                  <h3>Source references</h3>
                  <div className="references">
                    {selectedConcept.sourceReferences.length ? (
                      selectedConcept.sourceReferences.map((reference, index) => (
                        <button
                          key={`${reference.pageNumber}-${index}`}
                          onClick={() => setSelectedPage(reference.pageNumber)}
                        >
                          Page {reference.pageNumber}
                          {reference.quote && <small>“{reference.quote}”</small>}
                        </button>
                      ))
                    ) : (
                      <p>No direct source reference; this may be prerequisite background.</p>
                    )}
                  </div>
                  <h3>Ask the tutor</h3>
                  {review.reviewed > 0 && (
                    <div className="evidence-summary">
                      <p>
                        Reviewed sample only: {review.reviewed} claims. AI matched {review.agreed};{" "}
                        supported verdicts matched {review.supportedAgreed} of{" "}
                        {review.supportedReviewed} reviewed.
                      </p>
                      <button onClick={exportEvidenceReviews}>
                        Export reviewed examples and source passages
                      </button>
                    </div>
                  )}
                  <div className="tutor-actions">
                    <button onClick={() => explain("beginner")}>Beginner</button>
                    <button onClick={() => explain("technical")}>Technical</button>
                    <button onClick={() => explain("analogy")}>Analogy</button>
                    <button onClick={() => explain("worked-example")}>Worked example</button>
                  </div>
                  {typeof explanation === "string" && (
                    <div className="explanation">{explanation}</div>
                  )}
                  {explanation && typeof explanation !== "string" && (
                    <div className="explanation">
                      {explanation.sections.map((section, index) => (
                        <div key={index}>
                          <p>{section.text}</p>
                          {section.sourceReference ? (
                            <>
                              <button
                                onClick={() => setSelectedPage(section.sourceReference!.pageNumber)}
                              >
                                Page {section.sourceReference.pageNumber}: “
                                {section.sourceReference.quote}”
                              </button>
                              {section.evidence && (
                                <div className="evidence-check">
                                  <p>
                                    <strong>AI evidence check: {section.evidence.verdict}.</strong>{" "}
                                    {section.evidence.reason}
                                  </p>
                                  <label>
                                    Your assessment{" "}
                                    <select
                                      value={
                                        feedback[
                                          evidenceFeedbackId(
                                            document!.id,
                                            section.text,
                                            section.sourceReference,
                                          )
                                        ]?.correctedVerdict ?? ""
                                      }
                                      onChange={(event) =>
                                        void correctEvidence(
                                          section,
                                          event.target.value as EvidenceVerdict | "",
                                        )
                                      }
                                    >
                                      <option value="">No correction</option>
                                      <option value="supported">Supported</option>
                                      <option value="contradicted">Contradicted</option>
                                      <option value="unclear">Unclear</option>
                                    </select>
                                  </label>
                                </div>
                              )}
                            </>
                          ) : (
                            <small>Background or inference · no direct source quote</small>
                          )}
                        </div>
                      ))}
                      {feedbackError && <p role="alert">{feedbackError}</p>}
                    </div>
                  )}
                  {explanation && typeof explanation !== "string" && (
                    <ListenButton
                      text={explanation.sections.map((section) => section.text).join(" ")}
                    />
                  )}
                  <button className="quiz-button" onClick={startQuiz}>
                    Take a short quiz
                  </button>
                  {quiz && (
                    <div className="quiz">
                      {quiz.questions.map((question) => (
                        <fieldset key={question.id}>
                          <legend>{question.prompt}</legend>
                          {question.choices.map((choice) => (
                            <label key={choice}>
                              <input
                                type="radio"
                                name={question.id}
                                checked={answers[question.id] === choice}
                                onChange={() =>
                                  setAnswers((current) => ({ ...current, [question.id]: choice }))
                                }
                              />
                              {choice}
                            </label>
                          ))}
                        </fieldset>
                      ))}
                      <button className="primary" onClick={submitQuiz}>
                        Submit assessment
                      </button>
                    </div>
                  )}
                  {quizFeedback && <div className="explanation">{quizFeedback}</div>}
                </>
              ) : (
                <p>Select a concept to inspect it.</p>
              )}
              {selectedDependency && (
                <div className="dependency-note">
                  <span className="step">DEPENDENCY · {selectedDependency.evidenceType}</span>
                  <p>{selectedDependency.rationale}</p>
                </div>
              )}
            </aside>
          </section>
          {selectedPage && document && (
            <section className="pdf-panel">
              <div className="panel-heading">
                <div>
                  <span className="step">SOURCE · PAGE {selectedPage}</span>
                  <h2>Document evidence</h2>
                </div>
                <button className="secondary" onClick={() => setSelectedPage(null)}>
                  Close
                </button>
              </div>
              {pdfUrl ? (
                <iframe
                  title={`PDF page ${selectedPage}`}
                  src={`${pdfUrl}#page=${selectedPage}&view=FitH`}
                />
              ) : (
                <pre>
                  {document.pages.find((page) => page.pageNumber === selectedPage)?.text ??
                    "Page text unavailable."}
                </pre>
              )}
            </section>
          )}
          {document && <ContradictionPanel document={document} analysis={analysis} />}
        </>
      )}
    </main>
  );
}

function layoutGraph(
  analysis: DocumentAnalysis,
  mastery: Record<string, MasteryLevel>,
): { nodes: Node[]; edges: Edge[] } {
  const level = new Map<string, number>();
  for (const id of analysis.graph.topologicalOrder) {
    const parents = analysis.graph.dependencies
      .filter((edge) => edge.dependentId === id)
      .map((edge) => level.get(edge.prerequisiteId) ?? 0);
    level.set(id, parents.length ? Math.max(...parents) + 1 : 0);
  }
  const byLevel = new Map<number, string[]>();
  for (const id of analysis.graph.topologicalOrder)
    byLevel.set(level.get(id) ?? 0, [...(byLevel.get(level.get(id) ?? 0) ?? []), id]);
  const nodes = analysis.graph.concepts.map((concept) => {
    const column = level.get(concept.id) ?? 0;
    const row = byLevel.get(column)?.indexOf(concept.id) ?? 0;
    return {
      id: concept.id,
      position: { x: column * 260, y: row * 112 },
      data: { label: `${mastery[concept.id] === "mastered" ? "✓ " : ""}${concept.name}` },
      className: `concept-node ${concept.difficulty} ${mastery[concept.id] ?? "unknown"}`,
    };
  });
  const edges = analysis.graph.dependencies.map((dependency) => ({
    id: `${dependency.prerequisiteId}-${dependency.dependentId}`,
    source: dependency.prerequisiteId,
    target: dependency.dependentId,
    animated: false,
    style: {
      stroke: dependency.evidenceType === "source" ? "#355d4a" : "#a56a45",
      strokeWidth: 1.8,
      strokeDasharray: dependency.evidenceType === "inferred" ? "6 5" : undefined,
    },
  }));
  return { nodes, edges };
}
