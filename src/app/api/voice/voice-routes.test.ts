import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PRESET_VOICES } from "@/lib/voice/presets";
import { MAX_SPEECH_CHARACTERS } from "@/types/voice";
import { POST as speak } from "./speak/route";
import { GET as voices } from "./voices/route";

vi.mock("next/server", () => ({ connection: async () => undefined }));

const VOICE = PRESET_VOICES[0].id;
const fetchMock = vi.fn<typeof fetch>();

const speakRequest = (body: unknown) =>
  speak(
    new Request("http://localhost/api/voice/speak", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
const json = (body: unknown, status = 200) => Response.json(body, { status });

beforeEach(() => {
  process.env.ELEVENLABS_API_KEY = "test-key";
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  delete process.env.ELEVENLABS_API_KEY;
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});

describe("POST /api/voice/speak", () => {
  it("streams audio from ElevenLabs with the fast model and neighbouring text", async () => {
    fetchMock.mockResolvedValue(
      new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "audio/mpeg" } }),
    );
    const response = await speakRequest({ text: "Hello.", voiceId: VOICE, nextText: "Next." });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("audio/mpeg");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain(`/v1/text-to-speech/${VOICE}/stream`);
    expect((init?.headers as Record<string, string>)["xi-api-key"]).toBe("test-key");
    expect(JSON.parse(String(init?.body))).toMatchObject({
      text: "Hello.",
      model_id: "eleven_flash_v2_5",
      next_text: "Next.",
    });
  });

  it("reports a missing key without calling ElevenLabs", async () => {
    delete process.env.ELEVENLABS_API_KEY;
    const response = await speakRequest({ text: "Hello.", voiceId: VOICE });
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: { code: "VOICE_NOT_CONFIGURED" } });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects invalid voice ids and overlong text", async () => {
    const badId = await speakRequest({ text: "Hi.", voiceId: "../../v1/user" });
    expect(badId.status).toBe(400);
    const tooLong = await speakRequest({
      text: "a".repeat(MAX_SPEECH_CHARACTERS + 1),
      voiceId: VOICE,
    });
    expect(tooLong.status).toBe(413);
    expect(await tooLong.json()).toMatchObject({ error: { code: "TEXT_TOO_LONG" } });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    [
      401,
      { detail: { status: "quota_exceeded", message: "Quota exceeded" } },
      "VOICE_QUOTA_EXCEEDED",
      402,
    ],
    [401, { detail: { status: "invalid_api_key" } }, "VOICE_PROVIDER_ERROR", 502],
    [404, { detail: { status: "voice_not_found" } }, "VOICE_NOT_FOUND", 404],
    [429, { detail: "Too many requests" }, "VOICE_RATE_LIMITED", 429],
    [500, {}, "VOICE_PROVIDER_ERROR", 502],
  ])("maps ElevenLabs HTTP %i to %s", async (status, body, code, expectedStatus) => {
    fetchMock.mockResolvedValue(json(body, status));
    const response = await speakRequest({ text: "Hello.", voiceId: VOICE });
    expect(response.status).toBe(expectedStatus);
    expect(await response.json()).toMatchObject({ ok: false, error: { code } });
  });
});

describe("GET /api/voice/voices", () => {
  const get = () => voices(new Request("http://localhost/api/voice/voices"));

  it("returns the presets as unconfigured without a key", async () => {
    delete process.env.ELEVENLABS_API_KEY;
    expect(await (await get()).json()).toEqual({
      ok: true,
      data: { configured: false, presets: PRESET_VOICES, account: [] },
    });
  });

  it("keeps only presets the account has, and lists other account voices", async () => {
    fetchMock.mockImplementation(async (url) =>
      String(url).includes("voice_ids=")
        ? json({ voices: [{ voice_id: VOICE, name: "George", category: "premade" }] })
        : json({
            voices: [
              { voice_id: VOICE, name: "George", category: "premade" },
              { voice_id: "premadeOther123", name: "Other", category: "premade" },
              {
                voice_id: "myClone12345",
                name: "My clone",
                category: "cloned",
                labels: { accent: "american" },
                preview_url: "https://example.com/p.mp3",
              },
            ],
          }),
    );
    const { data } = await (await get()).json();
    expect(data.configured).toBe(true);
    expect(data.presets).toEqual([expect.objectContaining({ id: VOICE, category: "preset" })]);
    expect(data.account).toEqual([
      {
        id: "myClone12345",
        name: "My clone",
        description: "american",
        category: "cloned",
        previewUrl: "https://example.com/p.mp3",
      },
    ]);
  });
});
