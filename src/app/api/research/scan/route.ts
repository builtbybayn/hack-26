import { failure, readJson, routeError, success, timeoutSignal } from "@/lib/api/route-helpers";
import { scanRadar } from "@/lib/radar/scan";
import { scanRequestSchema } from "@/lib/radar/schema";
import { RadarError } from "@/lib/radar/x-search";

export async function POST(request: Request): Promise<Response> {
  try {
    const parsed = scanRequestSchema.safeParse(await readJson(request, 16_000));
    if (!parsed.success)
      return failure("INVALID_REQUEST", "Approve a valid project context before scanning.");
    return success(await scanRadar(parsed.data.context, timeoutSignal(request, 180_000)));
  } catch (error) {
    if (error instanceof RadarError)
      return failure(error.code, error.message, error.code === "RADAR_NOT_CONFIGURED" ? 503 : 502);
    return routeError(error, "api/research/scan");
  }
}
