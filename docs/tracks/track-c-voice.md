# Track C: Voice (ElevenLabs)

Read [the track overview](README.md) first for the rules every track follows.

## Goal

Smooth, clean listening for research papers:

- **Read aloud:** play the whole paper, or any section or paragraph, with a transcript that
  highlights what is being read and scrolls with it.
- **Listen:** any generated text (explanations today, other tracks' output later) can be heard
  with one button.
- **Voices:** a few curated presets, any voice in our ElevenLabs account (clones, saved library
  voices), a pasted voice ID, or the browser's own voice when ElevenLabs isn't configured.

The conversational voice tutor from the white paper is the stretch goal below.

## Status

Built on branch `feat/voice-reader`:

| Piece                         | Where                                        |
| ----------------------------- | -------------------------------------------- |
| Contract                      | `src/types/voice.ts`                         |
| Paper → listening script      | `src/lib/voice/reading-script.ts` (+ tests)  |
| ElevenLabs adapter            | `src/lib/voice/elevenlabs.ts` (server-only)  |
| Preset voices                 | `src/lib/voice/presets.ts`                   |
| Routes                        | `src/app/api/voice/{speak,voices}` (+ tests) |
| Browser client                | `src/lib/api/voice-client.ts`                |
| Player, picker, panel, button | `src/features/voice/`                        |
| Audio cache, reading position | `src/lib/browser-store.ts` (DB version 4)    |

Verified without a key: all unit and route tests pass with ElevenLabs faked, and in Chrome the
panel builds the white paper's script (185 segments, 16 sections), highlights and scrolls, and
plays with the browser voice. **Not yet verified with a real ElevenLabs key.**

## How it works

1. **Cleaning** (browser, free). `buildReadingScript(document)` removes running headers, page
   numbers, citations, URLs, the contents page, and the reference list; rejoins wrapped and
   hyphenated lines into paragraphs; expands abbreviations; and replaces equations and code with
   "An equation appears here. You can view it on page N of the PDF."
2. **Playback.** One request per segment (at most 1,000 characters). While one plays, the next two
   are fetched one at a time. Each request carries neighbouring text so intonation flows across
   segments. Audio is cached in IndexedDB, so replays and resumes are free.
3. **Cost.** Credits are billed per character; the white paper is about 49,000 characters. The
   default model is `eleven_flash_v2_5` (fastest, cheapest); "High quality" uses
   `eleven_multilingual_v2`. The panel shows the character count before reading.
4. **Speed** is changed in the browser (free and instant), not by regenerating audio.

## Using it from another track

```tsx
import { ListenButton } from "@/features/voice/ListenButton";

<ListenButton text={someGeneratedText} />;
```

It uses the voice, quality, and speed the user picked in the read-aloud panel, and only one
voice plays on the page at a time.

## Setup

Add to `.env.local` and restart:

```
ELEVENLABS_API_KEY=...
# optional overrides
ELEVENLABS_MODEL_FAST=eleven_flash_v2_5
ELEVENLABS_MODEL_HIGH=eleven_multilingual_v2
```

Without a key, everything still works with the browser voice, and the picker explains why
ElevenLabs voices are disabled.

## Next

- [ ] Test with a real key: presets resolve, account voices list, audio streams, and errors such as
      running out of credits show clearly. The preset IDs are ElevenLabs premade voices; the server
      drops any the account doesn't have.
- [ ] Sentence-level highlighting using ElevenLabs' `stream/with-timestamps` endpoint.
- [ ] Keyboard shortcuts (space to play and pause, arrow keys for previous and next).
- [ ] Optional: Gemini rewrites equations into speech instead of the "view it in the PDF" notice.
- [x] Extension: a temporary side panel (`extension/` + `/panel`) reuses the player, picker, and
      cache unchanged, and reads text selected on any web page aloud.

## Stretch: conversational voice tutor

From the white paper's voice spec: the user starts voice mode and grants the microphone; the
browser gets a short-lived **signed URL** from a server route (`POST /api/voice/session`) so the key
stays on the server; the agent gets scoped context (document, selection, page); factual questions
go to a server tool that answers from the paper (for example `/api/explain` with a `question`);
the transcript and source pages are shown, and Stop ends the session. Agree on the tool's request
and response with Track A first, and check ElevenLabs' current agent and authentication docs.
