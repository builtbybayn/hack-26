"use client";

import { useRef, useState } from "react";
import { VOICE_ID_PATTERN } from "@/lib/voice/presets";
import { BROWSER_VOICE_ID, type VoiceOption } from "@/types/voice";
import {
  BROWSER_VOICE,
  resolveVoice,
  updateVoicePreferences,
  useVoiceCatalog,
  useVoicePreferences,
} from "./preferences";

const CUSTOM = "__custom";

/** Choose a preset, any voice in the ElevenLabs account, a pasted voice id, or the browser voice. */
export function VoicePicker() {
  const preferences = useVoicePreferences();
  const catalog = useVoiceCatalog();
  const voice = resolveVoice(preferences.voice, catalog);
  const [customOpen, setCustomOpen] = useState(false);
  const [customId, setCustomId] = useState("");
  const [customError, setCustomError] = useState<string | null>(null);
  const previewRef = useRef<HTMLAudioElement | null>(null);

  const data = catalog?.ok ? catalog.data : null;
  const configured = data?.configured ?? false;
  const known = [...(data?.presets ?? []), ...(data?.account ?? [])];
  const selected = known.find((option) => option.id === voice.id);
  const isPastedVoice = voice.id !== BROWSER_VOICE_ID && !selected;

  const choose = (value: string) => {
    if (value === CUSTOM) {
      setCustomOpen(true);
      return;
    }
    setCustomOpen(false);
    const option = known.find((entry) => entry.id === value);
    updateVoicePreferences({
      voice: option ? { id: option.id, name: option.name } : BROWSER_VOICE,
    });
  };

  const applyCustom = () => {
    const id = customId.trim();
    if (!VOICE_ID_PATTERN.test(id)) {
      setCustomError("Paste a voice ID from ElevenLabs (letters and numbers only).");
      return;
    }
    setCustomError(null);
    setCustomOpen(false);
    updateVoicePreferences({ voice: { id, name: `Voice ${id.slice(0, 6)}…` } });
  };

  const preview = () => {
    if (!selected?.previewUrl) return;
    previewRef.current?.pause();
    previewRef.current = new Audio(selected.previewUrl);
    void previewRef.current.play().catch(() => undefined);
  };

  return (
    <div className="voice-picker">
      <label>
        Voice
        <select
          value={customOpen ? CUSTOM : voice.id}
          onChange={(event) => choose(event.target.value)}
        >
          <optgroup label="Presets">
            {(data?.presets ?? []).map((option) => (
              <VoiceOptionItem key={option.id} option={option} disabled={!configured} />
            ))}
          </optgroup>
          {data && data.account.length > 0 && (
            <optgroup label="Your ElevenLabs voices">
              {data.account.map((option) => (
                <VoiceOptionItem key={option.id} option={option} disabled={!configured} />
              ))}
            </optgroup>
          )}
          {isPastedVoice && <option value={voice.id}>{voice.name}</option>}
          <optgroup label="Other">
            <option value={CUSTOM} disabled={!configured}>
              Paste a voice ID…
            </option>
            <option value={BROWSER_VOICE_ID}>Browser voice (offline, not ElevenLabs)</option>
          </optgroup>
        </select>
      </label>
      {selected?.previewUrl && (
        <button type="button" className="secondary" onClick={preview}>
          Preview
        </button>
      )}
      {customOpen && (
        <div className="voice-custom">
          <label>
            ElevenLabs voice ID
            <input
              value={customId}
              onChange={(event) => setCustomId(event.target.value)}
              placeholder="e.g. 21m00Tcm4TlvDq8ikWAM"
              aria-invalid={customError ? true : undefined}
              aria-describedby="voice-custom-hint"
            />
          </label>
          <button type="button" className="primary" onClick={applyCustom}>
            Use voice
          </button>
          <small id="voice-custom-hint">
            {customError ??
              "Find it in ElevenLabs under My Voices. Library voices must be added to the account first."}
          </small>
        </div>
      )}
      {catalog && !configured && (
        <small className="voice-note">
          {catalog.ok
            ? "ElevenLabs isn't configured on the server, so the browser voice is used."
            : catalog.error.message}
        </small>
      )}
    </div>
  );
}

function VoiceOptionItem({ option, disabled }: { option: VoiceOption; disabled: boolean }) {
  const description =
    option.description && option.description.length > 48
      ? `${option.description.slice(0, 47)}…`
      : option.description;
  return (
    <option value={option.id} disabled={disabled}>
      {description ? `${option.name} · ${description}` : option.name}
    </option>
  );
}
