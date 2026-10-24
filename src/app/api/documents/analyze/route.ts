import { z } from "zod";
import { failure, readJson, routeError, success } from "@/lib/api/route-helpers";
import { analyzeDocument } from "@/lib/intelligence/gemini";
import { buildLearningPath } from "@/lib/intelligence/learning-path";
import { getAnalysis, getDocument, putAnalysis } from "@/lib/storage/document-store";

const requestSchema = z.object({
  documentId: z.string().min(1),
  mastery: z.record(z.string(), z.enum(["unknown", "learning", "mastered"])).optional(),
});

export async function POST(request: Request): Promise<Response> {
  try {
    const parsed = requestSchema.safeParse(await readJson(request));
    if (!parsed.success)
      return failure("INVALID_REQUEST", "Provide a valid documentId and mastery profile.");
    const document = getDocument(parsed.data.documentId);
    if (!document)
      return failure("DOCUMENT_NOT_FOUND", "Parse the document before analyzing it.", 404);
    const cached = getAnalysis(document.id);
    if (cached) {
      return success({
        analysis: { ...cached, learningPath: buildLearningPath(cached.graph, parsed.data.mastery) },
        cacheHit: true,
      });
    }
    const analysis = await analyzeDocument(document, parsed.data.mastery);
    putAnalysis(document.id, analysis);
    return success({ analysis, cacheHit: false });
  } catch (error) {
    return routeError(error, "api/documents/analyze");
  }
}
