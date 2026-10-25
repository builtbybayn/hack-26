import { z } from "zod";
import { failure, readJson, routeError, success } from "@/lib/api/route-helpers";
import { documentInputSchema } from "@/lib/intelligence/schema";
import { synthesizePapers } from "@/lib/synthesis/synthesize";
import type { ParsedDocument } from "@/types/ingestion";

const schema = z.object({ documents: z.array(documentInputSchema).min(2).max(4) });

export async function POST(request: Request): Promise<Response> {
  try {
    const body = schema.safeParse(await readJson(request));
    if (
      !body.success ||
      new Set(body.data.documents.map((item) => item.id)).size !== body.data.documents.length
    )
      return failure("INVALID_REQUEST", "Select two to four different parsed documents.");
    return success(await synthesizePapers(body.data.documents as unknown as ParsedDocument[]));
  } catch (error) {
    return routeError(error, "api/synthesis");
  }
}
