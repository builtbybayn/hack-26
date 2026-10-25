import { failure, routeError, success, timeoutSignal } from "@/lib/api/route-helpers";
import { ingestFile } from "@/lib/ingestion";
import { analyzePdfPreview } from "@/lib/research/pdf-preview";
import { MAX_FILE_BYTES } from "@/types/ingestion";

export async function POST(request: Request): Promise<Response> {
  if (Number(request.headers.get("content-length") ?? 0) > MAX_FILE_BYTES + 128 * 1024)
    return failure("FILE_TOO_LARGE", "PDF uploads must be 25 MB or smaller.", 413);
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return failure("NO_FILE", "Choose a PDF to analyze.");
    if (file.size > MAX_FILE_BYTES)
      return failure("FILE_TOO_LARGE", "PDF uploads must be 25 MB or smaller.", 413);
    if (!file.name.toLowerCase().endsWith(".pdf"))
      return failure("UNSUPPORTED_FORMAT", "Choose a PDF file.", 415);
    const document = await ingestFile(file);
    return success(await analyzePdfPreview(document, undefined, timeoutSignal(request, 60_000)));
  } catch (error) {
    return routeError(error, "api/papers/preview");
  }
}
