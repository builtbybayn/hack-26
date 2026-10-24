import { z } from "zod";
import { failure, readJson, routeError, success } from "@/lib/api/route-helpers";
import { conceptSchema, documentInputSchema } from "@/lib/intelligence/schema";
import { explainConcept } from "@/lib/intelligence/tutor";
import type { ParsedDocument } from "@/types/ingestion";

const schema = z.object({
  document: documentInputSchema,
  concept: conceptSchema,
  style: z.enum(["beginner", "technical", "analogy", "worked-example"]),
  question: z.string().max(1000).optional(),
});
export async function POST(request: Request): Promise<Response> {
  try {
    const body = schema.safeParse(await readJson(request));
    if (!body.success) return failure("INVALID_REQUEST", "The explanation request is invalid.");
    return success(
      await explainConcept({
        ...body.data,
        document: body.data.document as unknown as ParsedDocument,
      }),
    );
  } catch (error) {
    return routeError(error, "api/explain");
  }
}
