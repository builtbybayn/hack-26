"use client";

import { useEffect } from "react";
import "@/components/theme/obsidian-theme.css";

/** Shown when a page crashes. Your vault is stored in this browser, so nothing is lost. */
export default function Error({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main
      className="theme-obsidian"
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: 24,
        textAlign: "center",
      }}
    >
      <div>
        <h1 style={{ margin: "0 0 8px", fontSize: 20, fontWeight: 600 }}>Something went wrong</h1>
        <p style={{ margin: "0 0 20px", color: "var(--text-muted)" }}>
          Your papers and notes are saved in this browser and weren&apos;t affected.
        </p>
        <button type="button" className="mod-cta" onClick={() => retry()}>
          Try again
        </button>
      </div>
    </main>
  );
}
