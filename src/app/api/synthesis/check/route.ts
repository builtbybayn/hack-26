import { z } from "zod";
import { failure, readJson, routeError, success } from "@/lib/api/route-helpers";
import { documentInputSchema } from "@/lib/intelligence/schema";
import { quoteAppearsOnPage } from "@/lib/intelligence/source-evidence";
import { checkSynthesisFindings, findingSchema } from "@/lib/synthesis/synthesize";
import type { ParsedDocument } from "@/types/ingestion";

const schema = z.object({
  documents: z.array(documentInputSchema).min(2).max(4),
  findings: z.array(findingSchema).min(1).max(12),
});

export async function POST(request: Request): Promise<Response> {
  try {
    const body = schema.safeParse(await readJson(request));
    if (!body.success) return failure("INVALID_REQUEST", "The synthesis check request is invalid.");
    const { documents, findings } = body.data;
    if (
      new Set(documents.map((item) => item.id)).size !== documents.length ||
      findings.some(
        (finding) =>
          (finding.kind !== "open_question" &&
            new Set(finding.evidence.map((item) => item.documentId)).size < 2) ||
          finding.evidence.some((item) => {
            const page = documents
              .find((document) => document.id === item.documentId)
              ?.pages.find((entry) => entry.pageNumber === item.pageNumber);
            return !page || !quoteAppearsOnPage(page.text, item.quote);
          }),
      )
    )
      return failure("INVALID_REQUEST", "Every finding needs matching source pages and quotes.");
    return success(
      await checkSynthesisFindings(documents as unknown as ParsedDocument[], findings),
    );
  } catch (error) {
    return routeError(error, "api/synthesis/check");
  }
}
