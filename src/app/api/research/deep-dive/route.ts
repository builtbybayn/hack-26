import { failure, readJson, routeError, success, timeoutSignal } from "@/lib/api/route-helpers";
import { deepDiveRadar } from "@/lib/radar/scan";
import { deepDiveRequestSchema } from "@/lib/radar/schema";

export async function POST(request: Request): Promise<Response> {
  try {
    const parsed = deepDiveRequestSchema.safeParse(await readJson(request, 18_000));
    if (!parsed.success)
      return failure("INVALID_REQUEST", "Provide a current finding and approved project context.");
    const { context, finding } = parsed.data;
    if (context.projectId !== finding.projectId)
      return failure("INVALID_REQUEST", "This finding belongs to another project.");
    return success(await deepDiveRadar(context, finding, timeoutSignal(request, 90_000)));
  } catch (error) {
    if (error instanceof Error && error.message.includes("seven-day window"))
      return failure("INVALID_REQUEST", error.message);
    return routeError(error, "api/research/deep-dive");
  }
}
