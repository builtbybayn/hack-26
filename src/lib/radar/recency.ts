import type { ResearchScan, SocialSource } from "@/types/radar";

export const RADAR_WINDOW_MS = 7 * 24 * 60 * 60 * 1_000;
const X_EPOCH_MS = BigInt("1288834974657");

/** X status IDs encode creation time; an AI-supplied date alone is not trusted. */
export function verifiedXSource(url: string, now: Date): SocialSource | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (
    parsed.protocol !== "https:" ||
    !["x.com", "www.x.com", "twitter.com", "www.twitter.com"].includes(parsed.hostname)
  )
    return null;
  const match = parsed.pathname.match(/^\/(?:[A-Za-z0-9_]{1,15}|i)\/status\/(\d{15,25})\/?$/);
  if (!match) return null;
  const published = Number((BigInt(match[1]) >> BigInt(22)) + X_EPOCH_MS);
  if (
    !Number.isSafeInteger(published) ||
    published < now.getTime() - RADAR_WINDOW_MS ||
    published > now.getTime()
  )
    return null;
  return {
    platform: "x",
    url: `https://x.com/i/status/${match[1]}`,
    publishedAt: new Date(published).toISOString(),
  };
}

export function currentSources(sources: SocialSource[], now: Date): SocialSource[] {
  return sources.flatMap((source) => {
    if (source.platform === "x") {
      const verified = verifiedXSource(source.url, now);
      return verified ? [verified] : [];
    }
    const time = Date.parse(source.publishedAt);
    return Number.isFinite(time) && time >= now.getTime() - RADAR_WINDOW_MS && time <= now.getTime()
      ? [source]
      : [];
  });
}

export function activeScan(scan: ResearchScan, now = new Date()): ResearchScan {
  return {
    ...scan,
    findings: scan.findings.flatMap((finding) => {
      const socialSources = currentSources(finding.socialSources, now);
      return socialSources.length ? [{ ...finding, socialSources }] : [];
    }),
  };
}
