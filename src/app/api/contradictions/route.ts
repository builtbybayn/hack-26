import { z } from "zod";
import { failure, readJson, routeError, success } from "@/lib/api/route-helpers";
import { reviewPapers } from "@/lib/contradictions/review";
import { documentInputSchema } from "@/lib/intelligence/schema";
import type { ParsedDocument } from "@/types/ingestion";

const schema = z.object({ documents: z.tuple([documentInputSchema, documentInputSchema]) });

export async function POST(request: Request): Promise<Response> {
  try {
    const body = schema.safeParse(await readJson(request));
    if (!body.success || body.data.documents[0].id === body.data.documents[1].id)
      return failure("INVALID_REQUEST", "Select two different parsed documents.");
    return success(
      await reviewPapers(body.data.documents as unknown as [ParsedDocument, ParsedDocument]),
    );
  } catch (error) {
    return routeError(error, "api/contradictions");
  }
}
