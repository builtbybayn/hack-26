import "server-only";

import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { IntelligenceError } from "@/lib/intelligence/errors";
import { quoteAppearsOnPage } from "@/lib/intelligence/source-evidence";
import type { ParsedDocument } from "@/types/ingestion";
import type { ContradictionReport, ReviewFinding, ReviewVerdict } from "@/types/contradictions";

const verdict = z.enum(["contradiction", "compatible", "unclear"]);
const claim = z.object({
  documentId: z.string(),
  text: z.string().min(1).max(1000),
  conditions: z.string().max(500),
  pageNumber: z.number().int().positive(),
  quote: z.string().min(8).max(280),
});
const candidatesSchema = z.object({
  findings: z
    .array(
      z.object({
        topic: z.string().min(1).max(200),
        claims: z.tuple([claim, claim]),
        explanation: z.string().min(1).max(1500),
        alternativeExplanations: z.array(z.string().max(500)).max(5),
        verdict,
      }),
    )
    .max(8),
});
const grokSchema = z.object({
  reviews: z.array(z.object({ index: z.number().int().nonnegative(), verdict })),
});

type ReviewModel = (prompt: string) => Promise<string>;

export async function reviewPapers(
  documents: [ParsedDocument, ParsedDocument],
  gemini: ReviewModel = generateGeminiReview,
  grok: ReviewModel | null = process.env.XAI_API_KEY ? generateGrokReview : null,
): Promise<ContradictionReport> {
  const warnings: string[] = [];
  const excerpts = documents.map((document) => {
    const pages = document.pages
      .map((page) => `Page ${page.pageNumber}:\n${page.text}`)
      .join("\n\n");
    if (pages.length > 20_000)
      warnings.push(
        `${document.title ?? document.source.fileName}: only the first 20,000 characters were reviewed.`,
      );
    return `DOCUMENT ID: ${document.id}\nTITLE: ${document.title ?? document.source.fileName}\n${pages.slice(0, 20_000)}`;
  });
  const prompt = `Compare these two academic documents critically. Return JSON only: {"findings":[{"topic":"...","claims":[{"documentId":"...","text":"...","conditions":"...","pageNumber":1,"quote":"exact words on page"},{"documentId":"...","text":"...","conditions":"...","pageNumber":2,"quote":"exact words on page"}],"explanation":"...","alternativeExplanations":[],"verdict":"unclear"}]}. Choose each verdict from contradiction, compatible, or unclear. Return at most 8 meaningful claim pairs, with one claim from each document. Quote exact passages from the cited pages. A contradiction requires comparable conditions, metrics, populations and timeframes. Mark apparent conflicts with differing conditions as unclear. Return an empty array when no comparable claims are found.\n\n${excerpts.join("\n\n--- SECOND DOCUMENT ---\n\n")}`;
  let candidates: z.infer<typeof candidatesSchema>;
  try {
    candidates = candidatesSchema.parse(JSON.parse(await gemini(prompt)));
  } catch (error) {
    if (error instanceof IntelligenceError) throw error;
    throw new IntelligenceError(
      "MODEL_RESPONSE_INVALID",
      "The critical review could not be validated.",
      { cause: error },
    );
  }
  const ordered = candidates.findings.map((finding) => ({
    ...finding,
    claims:
      finding.claims[0].documentId === documents[1].id
        ? ([finding.claims[1], finding.claims[0]] as typeof finding.claims)
        : finding.claims,
  }));
  const verified = ordered.filter(
    (finding) =>
      finding.claims[0].documentId === documents[0].id &&
      finding.claims[1].documentId === documents[1].id &&
      finding.claims.every((item) => {
        const document = documents.find((entry) => entry.id === item.documentId);
        const page = document?.pages.find((entry) => entry.pageNumber === item.pageNumber);
        return page && quoteAppearsOnPage(page.text, item.quote);
      }),
  );
  if (verified.length !== candidates.findings.length)
    warnings.push(
      `${candidates.findings.length - verified.length} finding(s) were removed because their source quotes could not be verified.`,
    );

  const contested = verified
    .map((finding, index) => ({ finding, index }))
    .filter(({ finding }) => finding.verdict === "contradiction");
  const grokVerdicts = new Map<number, ReviewVerdict>();
  if (contested.length && grok) {
    try {
      const independentPrompt = `Independently judge whether each paired claim truly contradicts under comparable conditions. Do not assume another model's verdict. Return JSON only: {"reviews":[{"index":0,"verdict":"unclear"}]}. Choose each verdict from contradiction, compatible, or unclear. Review these pairs:\n${JSON.stringify(contested.map(({ finding, index }) => ({ index, topic: finding.topic, claims: finding.claims })))}`;
      const parsed = grokSchema.parse(JSON.parse(await grok(independentPrompt)));
      for (const review of parsed.reviews)
        if (contested.some((item) => item.index === review.index))
          grokVerdicts.set(review.index, review.verdict);
    } catch {
      warnings.push("Grok review failed; conflicting claims remain unconfirmed.");
    }
  } else if (contested.length)
    warnings.push("Grok is not configured; conflicting claims remain unconfirmed.");

  const findings: ReviewFinding[] = verified.map((finding, index) => {
    const grokVerdict = grokVerdicts.get(index) ?? "not_run";
    return {
      ...finding,
      verdict:
        finding.verdict === "contradiction"
          ? grokVerdict === "contradiction"
            ? "contradiction"
            : "unclear"
          : finding.verdict,
      review: { gemini: finding.verdict, grok: grokVerdict },
    };
  });
  if (
    contested.some(({ index }) => !grokVerdicts.has(index)) &&
    grok &&
    !warnings.some((item) => item.startsWith("Grok review failed"))
  )
    warnings.push(
      "Grok did not review every candidate conflict; those findings remain unconfirmed.",
    );
  return { documentIds: [documents[0].id, documents[1].id], findings, warnings };
}

async function generateGeminiReview(prompt: string): Promise<string> {
  if (!process.env.GEMINI_API_KEY)
    throw new IntelligenceError("AI_NOT_CONFIGURED", "Gemini is not configured on the server.");
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const response = await ai.models.generateContent({
    model: process.env.GEMINI_MODEL ?? "gemini-3.8-flash",
    contents: prompt,
    config: { responseMimeType: "application/json", maxOutputTokens: 6000, temperature: 0.2 },
  });
  if (!response.text)
    throw new IntelligenceError("PROVIDER_ERROR", "Gemini returned an empty review.");
  return response.text;
}

async function generateGrokReview(prompt: string): Promise<string> {
  const response = await fetch("https://api.x.ai/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.XAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.XAI_MODEL ?? "grok-4.7",
      input: prompt,
      store: false,
      max_output_tokens: 4000,
      text: { format: { type: "json_object" } },
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Grok returned ${response.status}`);
  const body: unknown = await response.json();
  const parsed = z
    .object({
      output: z.array(
        z.object({
          type: z.string(),
          content: z.array(z.object({ type: z.string(), text: z.string().optional() })).optional(),
        }),
      ),
    })
    .parse(body);
  const answer = parsed.output
    .flatMap((item) => (item.type === "message" ? (item.content ?? []) : []))
    .find((item) => item.type === "output_text")?.text;
  if (!answer) throw new Error("Grok returned no review.");
  return answer;
}
