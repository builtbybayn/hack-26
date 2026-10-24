import { failure, success } from "@/lib/api/route-helpers";
import { getDocument } from "@/lib/storage/document-store";

export async function GET(
  _request: Request,
  context: RouteContext<"/api/documents/[id]">,
): Promise<Response> {
  const { id } = await context.params;
  const document = getDocument(id);
  return document
    ? success(document)
    : failure("DOCUMENT_NOT_FOUND", "That document is not in the server cache.", 404);
}
