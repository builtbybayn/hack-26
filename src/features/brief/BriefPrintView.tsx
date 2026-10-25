"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getProject, listDocumentRecords, type DocumentRecord } from "@/lib/browser-store";
import type { ResearchBrief } from "@/types/brief";
import { BriefView } from "./BriefView";
import styles from "./brief.module.css";

export function BriefPrintView() {
  const [brief, setBrief] = useState<ResearchBrief | null>(null);
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [message, setMessage] = useState("Loading brief…");

  useEffect(() => {
    async function load() {
      const projectId = new URLSearchParams(window.location.search).get("project");
      if (!projectId) return setMessage("No project was selected.");
      try {
        const [project, saved] = await Promise.all([getProject(projectId), listDocumentRecords()]);
        setBrief(project?.brief ?? null);
        setDocuments(saved);
        if (!project?.brief) setMessage("No saved brief was found for this project.");
      } catch {
        setMessage("The brief could not be loaded from this browser.");
      }
    }
    void load();
  }, []);

  return (
    <main className={styles.printPage}>
      <div className={styles.printControls}>
        <Link href="/">Back to workspace</Link>
        {brief && (
          <button className="primary" onClick={() => window.print()}>
            Print or save as PDF
          </button>
        )}
      </div>
      {brief ? <BriefView brief={brief} documents={documents} /> : <p role="status">{message}</p>}
    </main>
  );
}
