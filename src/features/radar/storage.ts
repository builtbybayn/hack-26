import { getWorkspaceState, putWorkspaceState } from "@/lib/browser-store";
import { activeScan } from "@/lib/radar/recency";
import type { ResearchScan } from "@/types/radar";

const key = (projectId: string) => `radar:${projectId}`;

export async function loadRadarScan(projectId: string): Promise<ResearchScan | null> {
  const stored = await getWorkspaceState<ResearchScan>(key(projectId));
  if (!stored || stored.projectId !== projectId) return null;
  const current = activeScan(stored);
  if (current.findings.length !== stored.findings.length)
    await putWorkspaceState(current, key(projectId));
  return current;
}

export function saveRadarScan(scan: ResearchScan): Promise<void> {
  return putWorkspaceState(activeScan(scan), key(scan.projectId));
}
