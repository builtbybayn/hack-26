import { z } from "zod";
import { failure, readJson, routeError, success } from "@/lib/api/route-helpers";
import { analyzeDocument } from "@/lib/intelligence/gemini";
import { documentInputSchema } from "@/lib/intelligence/schema";
import type { AnalyzeDocumentResult } from "@/types/intelligence";
import type { ParsedDocument } from "@/types/ingestion";

const requestSchema = z.object({
  document: documentInputSchema,
  mastery: z.record(z.string(), z.enum(["unknown", "learning", "mastered"])).optional(),
});

export async function POST(request: Request): Promise<Response> {
  try {
    const parsed = requestSchema.safeParse(await readJson(request));
    if (!parsed.success)
      return failure("INVALID_REQUEST", "Provide a parsed document and an optional mastery map.");
    const analysis = await analyzeDocument(
      parsed.data.document as unknown as ParsedDocument,
      parsed.data.mastery,
    );
    return success({ analysis } satisfies AnalyzeDocumentResult);
  } catch (error) {
    return routeError(error, "api/documents/analyze");
  }
}
