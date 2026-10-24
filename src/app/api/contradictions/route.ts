import { z } from "zod";
import { failure, readJson, routeError, success, timeoutSignal } from "@/lib/api/route-helpers";
import { compareDocuments } from "@/lib/contradictions/compare";
import { documentInputSchema } from "@/lib/intelligence/schema";
import type { ParsedDocument } from "@/types/ingestion";
import type { DocumentAnalysis } from "@/types/intelligence";

const requestSchema = z.object({
  documents: z.array(documentInputSchema).min(2).max(4),
  analyses: z
    .array(
      z.looseObject({
        understanding: z.looseObject({ topics: z.array(z.string()) }),
        graph: z.looseObject({ documentId: z.string() }),
      }),
    )
    .max(4)
    .optional(),
});

export async function POST(request: Request): Promise<Response> {
  try {
    const parsed = requestSchema.safeParse(await readJson(request));
    if (
      !parsed.success ||
      new Set(parsed.data.documents.map((document) => document.id)).size !==
        parsed.data.documents.length ||
      parsed.data.documents.some((document) => document.pages.length === 0)
    )
      return failure("INVALID_REQUEST", "Provide two to four distinct parsed documents.");
    if (parsed.data.analyses && parsed.data.analyses.length !== parsed.data.documents.length)
      return failure("INVALID_REQUEST", "Provide one analysis per document or omit analyses.");
    const report = await compareDocuments(
      {
        documents: parsed.data.documents as unknown as ParsedDocument[],
        analyses: parsed.data.analyses as DocumentAnalysis[] | undefined,
      },
      timeoutSignal(request, 90_000),
    );
    return success(report);
  } catch (error) {
    return routeError(error, "api/contradictions");
  }
}
