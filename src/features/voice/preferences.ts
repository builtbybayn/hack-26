/**
 * Voice preferences shared by every voice control on the page and remembered per browser.
 * Kept in localStorage: a per-viewer convenience, safe to lose.
 */
import { useEffect, useState, useSyncExternalStore } from "react";
import { getVoices } from "@/lib/api/voice-client";
import { BROWSER_VOICE_ID, type VoiceQuality, type VoicesResponse } from "@/types/voice";

export interface VoiceChoice {
  id: string;
  name: string;
}

export interface VoicePreferences {
  /** `null` until the user picks; `resolveVoice` supplies a sensible default. */
  voice: VoiceChoice | null;
  quality: VoiceQuality;
  rate: number;
}

export const BROWSER_VOICE: VoiceChoice = { id: BROWSER_VOICE_ID, name: "Browser voice" };
export const PLAYBACK_RATES = [0.75, 1, 1.25, 1.5, 1.75, 2];

const STORAGE_KEY = "knowbefore.voice";
const DEFAULTS: VoicePreferences = { voice: null, quality: "fast", rate: 1 };
const listeners = new Set<() => void>();
let snapshot: VoicePreferences | null = null;

function readPreferences(): VoicePreferences {
  if (snapshot) return snapshot;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    snapshot = stored
      ? { ...DEFAULTS, ...(JSON.parse(stored) as Partial<VoicePreferences>) }
      : DEFAULTS;
  } catch {
    snapshot = DEFAULTS;
  }
  return snapshot;
}

export function updateVoicePreferences(patch: Partial<VoicePreferences>): void {
  snapshot = { ...readPreferences(), ...patch };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    // Storage can be unavailable (private mode); the preference still applies for this page.
  }
  for (const listener of listeners) listener();
}

export function useVoicePreferences(): VoicePreferences {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    readPreferences,
    () => DEFAULTS,
  );
}

let catalogRequest: Promise<VoicesResponse> | null = null;

/** The server's voice list, fetched once per page and shared by every voice control. */
export function useVoiceCatalog(): VoicesResponse | null {
  const [catalog, setCatalog] = useState<VoicesResponse | null>(null);
  useEffect(() => {
    let active = true;
    catalogRequest ??= getVoices();
    void catalogRequest.then((response) => {
      if (!response.ok) catalogRequest = null; // allow a retry on the next mount
      if (active) setCatalog(response);
    });
    return () => {
      active = false;
    };
  }, []);
  return catalog;
}

/**
 * The voice to use: the user's pick if it can work, otherwise the first preset (when ElevenLabs
 * is configured) or the browser voice.
 */
export function resolveVoice(
  preferred: VoiceChoice | null,
  catalog: VoicesResponse | null,
): VoiceChoice {
  const configured = catalog?.ok ? catalog.data.configured : null;
  if (preferred && (preferred.id === BROWSER_VOICE_ID || configured !== false)) return preferred;
  const fallback = catalog?.ok ? (catalog.data.presets[0] ?? catalog.data.account[0]) : null;
  return configured && fallback ? { id: fallback.id, name: fallback.name } : BROWSER_VOICE;
}
