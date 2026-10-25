import { success } from "@/lib/api/route-helpers";
import { connection } from "next/server";

export async function GET(): Promise<Response> {
  await connection();
  return success({
    status: "healthy",
    providers: {
      luminal: Boolean(process.env.LUMINAL_API_KEY),
      gemini: Boolean(process.env.GEMINI_API_KEY),
      mistral: Boolean(process.env.MISTRAL_API_KEY),
      mathpix: Boolean(process.env.MATHPIX_APP_ID && process.env.MATHPIX_APP_KEY),
      elevenlabs: Boolean(process.env.ELEVENLABS_API_KEY),
    },
  });
}
