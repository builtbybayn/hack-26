"use client";

import { useSyncExternalStore } from "react";

/** Per-browser preferences. Conveniences only, so localStorage is enough. */
export interface VaultSettings {
  /** Shown on comments. */
  authorName: string;
  vaultName: string;
  theme: "dark" | "light" | "system";
}

const KEY = "knowbefore.vaultSettings";
const DEFAULTS: VaultSettings = { authorName: "You", vaultName: "research", theme: "dark" };
const listeners = new Set<() => void>();
let cached: VaultSettings | null = null;

function read(): VaultSettings {
  if (cached) return cached;
  try {
    cached = { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") };
  } catch {
    cached = DEFAULTS;
  }
  return cached!;
}

export function updateSettings(patch: Partial<VaultSettings>) {
  cached = { ...read(), ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(cached));
  } catch {
    // Storage blocked: the change still applies for this visit.
  }
  for (const listener of listeners) listener();
}

export function useSettings(): VaultSettings {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    read,
    () => DEFAULTS,
  );
}

/** Reads and writes a small per-browser UI value (e.g. sidebar width). */
export function loadLocal<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(`knowbefore.${key}`);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function saveLocal(key: string, value: unknown) {
  try {
    localStorage.setItem(`knowbefore.${key}`, JSON.stringify(value));
  } catch {
    // Ignore: a convenience only.
  }
}
