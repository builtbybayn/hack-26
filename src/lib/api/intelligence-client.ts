import type {
  AnalyzeDocumentResponse,
  EvaluateRequest,
  EvaluateResponse,
  ExplainRequest,
  ExplainResponse,
  GetDocumentResponse,
  ParseDocumentResponse,
  ParseOptions,
  QuizResponse,
} from "@/types/intelligence";

export async function parseDocument(
  file: File,
  options: ParseOptions,
  signal?: AbortSignal,
): Promise<ParseDocumentResponse> {
  const body = new FormData();
  body.append("file", file);
  body.append("mode", options.mode ?? "automatic");
  body.append("ocrProvider", options.ocrProvider ?? "mistral");
  body.append("allowExternalProcessing", String(options.allowExternalProcessing ?? false));
  return requestJson("/api/documents/parse", { method: "POST", body, signal });
}

export function analyzeDocument(
  documentId: string,
  mastery: Record<string, string>,
  signal?: AbortSignal,
): Promise<AnalyzeDocumentResponse> {
  return requestJson("/api/documents/analyze", jsonRequest({ documentId, mastery }, signal));
}

export function getDocument(documentId: string): Promise<GetDocumentResponse> {
  return requestJson(`/api/documents/${encodeURIComponent(documentId)}`);
}

export function requestExplanation(input: ExplainRequest): Promise<ExplainResponse> {
  return requestJson("/api/explain", jsonRequest(input));
}

export function requestQuiz(documentId: string, conceptId: string): Promise<QuizResponse> {
  return requestJson("/api/quiz", jsonRequest({ documentId, conceptId }));
}

export function evaluateAnswers(input: EvaluateRequest): Promise<EvaluateResponse> {
  return requestJson("/api/evaluate", jsonRequest(input));
}

function jsonRequest(body: unknown, signal?: AbortSignal): RequestInit {
  return {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  };
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  try {
    const response = await fetch(url, init);
    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    return {
      ok: false,
      error: { code: "NETWORK_ERROR", message: "Could not reach the KnowBefore server." },
    } as T;
  }
}
