import { track } from "@/lib/agent-activity";
import type {
  AnalyzeDocumentResponse,
  AnalyzeRequest,
  Concept,
  EvaluateRequest,
  EvaluateResponse,
  ExplainRequest,
  ExplainResponse,
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
  return track("reading", `Reading ${file.name}`, () =>
    requestJson("/api/documents/parse", { method: "POST", body, signal }),
  );
}

export function analyzeDocument(
  input: AnalyzeRequest,
  signal?: AbortSignal,
): Promise<AnalyzeDocumentResponse> {
  return track(
    "analyzing",
    `Analyzing ${input.document.title ?? input.document.source.fileName}`,
    () => requestJson("/api/documents/analyze", jsonRequest(input, signal)),
  );
}

export function requestExplanation(input: ExplainRequest): Promise<ExplainResponse> {
  return track("thinking", `Explaining ${input.concept.name}`, () =>
    requestJson("/api/explain", jsonRequest(input)),
  );
}

export function requestQuiz(concept: Concept): Promise<QuizResponse> {
  return track("thinking", `Writing a quiz on ${concept.name}`, () =>
    requestJson("/api/quiz", jsonRequest({ concept })),
  );
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
      error: { code: "NETWORK_ERROR", message: "Could not reach the Fluid Research server." },
    } as T;
  }
}
