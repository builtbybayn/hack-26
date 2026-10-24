import { parseDocumentFile } from "@/lib/ingestion/parse-document";
import { failure, routeError, success, timeoutSignal } from "@/lib/api/route-helpers";
import { MAX_FILE_BYTES } from "@/types/ingestion";

export async function POST(request: Request): Promise<Response> {
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_FILE_BYTES + 128 * 1024)
    return failure("FILE_TOO_LARGE", "PDF uploads must be 25 MB or smaller.", 413);
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File))
      return failure("NO_FILE", "No file was provided in the file field.");
    const modeValue = form.get("mode");
    const providerValue = form.get("ocrProvider");
    const mode = modeValue === "standard" || modeValue === "advanced" ? modeValue : "automatic";
    const ocrProvider = providerValue === "mathpix" ? "mathpix" : "mistral";
    const allowExternalProcessing = form.get("allowExternalProcessing") === "true";
    const result = await parseDocumentFile(
      file,
      { mode, ocrProvider, allowExternalProcessing },
      timeoutSignal(request, 120_000),
    );
    return success(result);
  } catch (error) {
    return routeError(error, "api/documents/parse");
  }
}
