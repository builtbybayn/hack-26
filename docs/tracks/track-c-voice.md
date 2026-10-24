# Track C: Voice (ElevenLabs)

Read [the track overview](README.md) first for the rules every track follows.

## Goal

Let a reader **listen** to explanations: press Listen on any generated explanation and hear it
in a natural voice, with clear playing and stopped states.

This is the first step toward the white paper's voice tutor (a two-way spoken conversation about
the paper). Text-to-speech comes first because it is independent and demo-safe; the conversational
agent is a stretch goal below.

## You own

| Path                                           | Status                                    |
| ---------------------------------------------- | ----------------------------------------- |
| `src/lib/voice/`                               | **New.** ElevenLabs adapter (server-only) |
| `src/app/api/voice/speak/route.ts`             | **New**                                   |
| `src/types/voice.ts`                           | **New** contract                          |
| `src/lib/api/voice-client.ts`, `voice-mock.ts` | **New**                                   |
| `src/features/voice/`                          | **New** UI component                      |

## What you depend on

Only the explanation text. `POST /api/explain` already returns
`{ explanation: string, sourceReferences: SourceReference[] }`, and the UI shows it. You don't
need anything from Tracks A or B: anything that produces text can use your Listen button.

## Step 1 (first hour): contract

`src/types/voice.ts` (proposal; adjust in your first PR):

```ts
import type { ApiResponse, CommonErrorCode } from "./api";

/** Upper bound per request: keeps latency and cost predictable. */
export const MAX_SPEECH_CHARACTERS = 2_500;

export interface SpeakRequest {
  text: string;
  /** Optional override; the server falls back to ELEVENLABS_VOICE_ID. */
  voiceId?: string;
}

export type VoiceErrorCode = "VOICE_NOT_CONFIGURED" | "TEXT_TOO_LONG" | "VOICE_PROVIDER_ERROR";

/** Error body only. On success the route returns audio, not JSON (see below). */
export type SpeakErrorResponse = ApiResponse<never, VoiceErrorCode | CommonErrorCode>;
```

**The one exception to the JSON envelope:** on success, `POST /api/voice/speak` returns the audio
bytes directly (`Content-Type: audio/mpeg`) so the browser can play or stream them. Failures still
return the standard `{ ok: false, error: { code, message } }` JSON with an error status. Document
this in `docs/ARCHITECTURE.md`.

The client wraps that difference so callers get one shape:

```ts
// src/lib/api/voice-client.ts (browser-safe)
export async function speak(
  text: string,
  signal?: AbortSignal,
): Promise<{ ok: true; audio: Blob } | { ok: false; error: { code: string; message: string } }>;
```

**Mock:** `src/lib/api/voice-mock.ts` can use the browser's built-in `speechSynthesis` so the UI
works with no key. Label it in the UI as the mock voice, so it is never mistaken for ElevenLabs.

## Step 2: server adapter and route

- `src/lib/voice/elevenlabs.ts` (`import "server-only"`): call ElevenLabs' text-to-speech API
  with `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`, and `ELEVENLABS_MODEL_ID` from the environment.
  Check ElevenLabs' current docs for the endpoint, model ids, and output formats; prefer a
  low-latency model and MP3 output. Use the official SDK or plain `fetch`, whichever is simpler;
  record a new dependency in `docs/DECISIONS.md`.
- `src/app/api/voice/speak/route.ts`:
  - Validate with zod: non-empty `text`, at most `MAX_SPEECH_CHARACTERS` (`TEXT_TOO_LONG`, 413).
  - Missing key: `VOICE_NOT_CONFIGURED` (503). Provider failure or quota: `VOICE_PROVIDER_ERROR` (502).
  - Add a timeout (`timeoutSignal` in `src/lib/api/route-helpers.ts`).
  - Stream the provider's response body through to the client if practical; it reduces the time
    to first sound.
- **Never** send the API key to the browser or the extension, and never log it.

Unit-test the route with `fetch` mocked: success returns audio, plus each error code. Tests must
not call ElevenLabs.

## Step 3: UI

`src/features/voice/ListenButton.tsx`, a small reusable component:

```tsx
<ListenButton text={explanation} />
```

- States: idle → loading → playing → idle, with a visible Stop at all times while playing.
- One audio at a time: starting a new one stops the previous.
- Revoke object URLs when done; stop playback when the component unmounts.
- Long text: if over the limit, split on sentence boundaries and play the chunks in order (or
  disable with a clear message for the first version).
- Accessible: a real `<button>` with an `aria-label` and an `aria-live` status ("Playing", "Stopped").
- Mount it next to the explanation in `DocumentIntelligence.tsx` with one line. Tracks A and B can
  reuse it for their own text.

Optional: cache audio per text in memory for the page session to avoid paying twice for replays.
If you want it to persist, add a store to `src/lib/browser-store.ts`, and announce it first because
it bumps `DB_VERSION`.

## Stretch: conversational voice tutor

Only after Listen is merged and solid. From the white paper's voice spec:

1. The user explicitly starts voice mode and grants microphone access.
2. The browser gets a short-lived **signed URL** from a server route (`POST /api/voice/session`);
   the API key stays on the server.
3. The agent receives scoped context: document id, selected text, concept, page.
4. For factual questions, the agent calls a server tool that answers from the paper (for example,
   `/api/explain` with a `question`), so answers stay grounded in the document rather than in the
   conversation history.
5. The transcript and source pages appear in the UI; Stop ends the session.

Check ElevenLabs' current agent and authentication docs before starting. This touches Track A's
explain logic, so agree on the tool's request and response with Track A first.

## Definition of done

- [ ] Contract, client, and mock merged in the first hour.
- [ ] `/api/voice/speak` returns playable audio via `curl -o out.mp3` with a real key, and the
      documented error codes without one.
- [ ] Route tests cover success and every error code, with no network.
- [ ] Listen button on explanations: plays, stops, handles errors visibly, works by keyboard.
- [ ] The app still runs without an ElevenLabs key (button shows "Voice not configured" or uses
      the labeled mock).
- [ ] No key in the client bundle: `npm run build`, then search `.next/static` for the key's prefix.
- [ ] `docs/ARCHITECTURE.md` documents the endpoint, including the audio success response; env vars
      appended to `.env.example`.

## Out of scope

Speech-to-text and the conversational agent (stretch above), changing the explanation format,
extension-specific code.
