import { z } from "zod";
import { failure, readJson, routeError, success } from "@/lib/api/route-helpers";
import { documentInputSchema } from "@/lib/intelligence/schema";
import { quoteAppearsOnPage } from "@/lib/intelligence/source-evidence";
import { checkSynthesisFindings } from "@/lib/synthesis/synthesize";
import type { ParsedDocument } from "@/types/ingestion";

const schema = z.object({
  documents: z.array(documentInputSchema).min(1).max(4),
  finding: z.object({
    kind: z.enum(["agreement", "difference", "open_question"]),
    theme: z.string().min(1).max(200),
    summary: z.string().trim().min(1).max(1500),
    evidence: z
      .array(
        z.object({
          documentId: z.string().min(1),
          pageNumber: z.number().int().positive(),
          quote: z.string().min(8).max(280),
        }),
      )
      .min(1)
      .max(8),
  }),
});

export async function POST(request: Request): Promise<Response> {
  try {
    const body = schema.safeParse(await readJson(request));
    if (!body.success) return failure("INVALID_REQUEST", "The brief check request is invalid.");
    const { documents, finding } = body.data;
    if (
      new Set(documents.map((item) => item.id)).size !== documents.length ||
      (finding.kind !== "open_question" &&
        new Set(finding.evidence.map((item) => item.documentId)).size < 2) ||
      finding.evidence.some((item) => {
        const page = documents
          .find((document) => document.id === item.documentId)
          ?.pages.find((entry) => entry.pageNumber === item.pageNumber);
        return !page || !quoteAppearsOnPage(page.text, item.quote);
      })
    )
      return failure("INVALID_REQUEST", "Each cited quote must match a supplied source page.");
    const checked = await checkSynthesisFindings(documents as unknown as ParsedDocument[], [
      finding,
    ]);
    return success({ finding: checked.findings[0] });
  } catch (error) {
    return routeError(error, "api/brief/check");
  }
}
