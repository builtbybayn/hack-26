import "server-only";

import { z } from "zod";
import type { PaperRecord, ResearchErrorCode } from "@/types/research";

export class ResearchError extends Error {
  constructor(
    public readonly code: ResearchErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ResearchError";
  }
}

export interface ResearchProvider {
  name: PaperRecord["provider"];
  search(query: string, options: { limit: number; signal?: AbortSignal }): Promise<PaperRecord[]>;
}

const locationSchema = z.object({
  pdf_url: z.string().nullish(),
  is_oa: z.boolean().optional(),
  source: z.object({ display_name: z.string().nullish() }).nullish(),
});
const workSchema = z.object({
  id: z.string().regex(/^https:\/\/openalex\.org\/W\d+$/),
  display_name: z.string().min(1),
  authorships: z.array(z.object({ author: z.object({ display_name: z.string() }) })),
  publication_year: z.number().int().nullish(),
  doi: z.string().nullish(),
  primary_location: locationSchema.nullish(),
  best_oa_location: locationSchema.nullish(),
  cited_by_count: z.number().int().nonnegative().optional(),
  abstract_inverted_index: z.record(z.string(), z.array(z.number().int().nonnegative())).nullish(),
});

function webUrl(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password
      ? url.href
      : undefined;
  } catch {
    return undefined;
  }
}

/** Sort positions instead of allocating a sparse array from untrusted offsets. */
export function reconstructAbstract(index: Record<string, number[]> | null | undefined) {
  if (!index) return undefined;
  return (
    Object.entries(index)
      .flatMap(([word, positions]) => positions.map((position) => ({ word, position })))
      .sort((a, b) => a.position - b.position)
      .map(({ word }) => word)
      .join(" ") || undefined
  );
}

export const openAlex: ResearchProvider = {
  name: "openalex",
  async search(query, { limit, signal }) {
    const url = new URL("https://api.openalex.org/works");
    url.searchParams.set("search", query);
    url.searchParams.set("per_page", String(Math.min(20, Math.max(1, limit))));
    url.searchParams.set(
      "select",
      "id,display_name,authorships,publication_year,doi,primary_location,best_oa_location,cited_by_count,abstract_inverted_index",
    );
    const key = process.env.OPENALEX_API_KEY;
    try {
      const response = await fetch(url, {
        headers: key ? { Authorization: `Bearer ${key}` } : {},
        signal: signal
          ? AbortSignal.any([signal, AbortSignal.timeout(12_000)])
          : AbortSignal.timeout(12_000),
        cache: "no-store",
      });
      if (response.status === 429) {
        throw new ResearchError(
          "SEARCH_RATE_LIMITED",
          "OpenAlex’s search limit was reached. Try again later or configure OPENALEX_API_KEY.",
        );
      }
      if (!response.ok)
        throw new ResearchError(
          "SEARCH_PROVIDER_ERROR",
          "OpenAlex could not complete the search. Try again later.",
        );
      const data = z.object({ results: z.array(workSchema) }).parse(await response.json());
      return data.results.map((work) => ({
        id: `openalex:${work.id.split("/").at(-1)}`,
        title: work.display_name,
        authors: work.authorships.map(({ author }) => author.display_name),
        year: work.publication_year ?? undefined,
        venue: work.primary_location?.source?.display_name ?? undefined,
        doi: webUrl(work.doi),
        abstract: reconstructAbstract(work.abstract_inverted_index),
        url: work.id,
        openAccessPdfUrl: work.best_oa_location?.is_oa
          ? webUrl(work.best_oa_location.pdf_url)
          : undefined,
        citationCount: work.cited_by_count,
        provider: "openalex" as const,
      }));
    } catch (error) {
      if (error instanceof ResearchError) throw error;
      if (signal?.aborted) throw signal.reason;
      throw new ResearchError(
        "SEARCH_PROVIDER_ERROR",
        "OpenAlex is unavailable or returned an invalid response. Please retry.",
      );
    }
  },
};
