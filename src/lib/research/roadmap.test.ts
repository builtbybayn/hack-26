import { describe, expect, it, vi } from "vitest";
import type { PaperRecord } from "@/types/research";
import type { Roadmap } from "@/types/roadmap";
import { roadmapToMarkdown } from "./roadmap-markdown";
import { buildRoadmap, roadmapPrompt } from "./roadmap";

const paper = (id: string, extra: Partial<PaperRecord> = {}): PaperRecord => ({
  id,
  title: `Paper ${id}`,
  authors: ["Ada Lovelace", "Alan Turing"],
  year: 2020,
  url: `https://openalex.org/${id}`,
  provider: "openalex",
  ...extra,
});

const plan = {
  projectName: "Quantum RL",
  goal: "Understand quantum approaches to reinforcement learning.",
  summary: "From RL basics to quantum amplitude amplification.",
  reply: "I planned two stages.",
  stages: [
    {
      title: "Reinforcement learning",
      goal: "Know policies and rewards.",
      concepts: [{ name: "Policy gradient", why: "Core training method." }],
      searchQuery: "policy gradient reinforcement learning",
    },
    {
      title: "Grover search",
      goal: "Understand amplitude amplification.",
      concepts: [{ name: "Amplitude amplification", why: "The quantum speedup used." }],
      searchQuery: "Grover amplitude amplification",
    },
  ],
};

describe("buildRoadmap", () => {
  it("finds real papers per stage and lists each paper once", async () => {
    const search = vi
      .fn()
      .mockResolvedValueOnce([paper("A"), paper("B")])
      .mockResolvedValueOnce([paper("B"), paper("C")]);
    const result = await buildRoadmap({ idea: "quantum RL" }, undefined, {
      plan: async () => plan,
      provider: { name: "openalex", search },
    });
    expect(search).toHaveBeenCalledWith("policy gradient reinforcement learning", {
      limit: 5,
      signal: undefined,
    });
    expect(result.roadmap.stages.map((stage) => stage.papers.map((p) => p.id))).toEqual([
      ["A", "B"],
      ["C"],
    ]);
    expect(result.reply).toBe("I planned two stages.");
  });

  it("keeps a stage going when its search fails, with a warning", async () => {
    const search = vi.fn().mockRejectedValueOnce(new Error("down")).mockResolvedValueOnce([]);
    const result = await buildRoadmap({ idea: "quantum RL" }, undefined, {
      plan: async () => plan,
      provider: { name: "openalex", search },
    });
    expect(result.roadmap.stages[0].papers).toEqual([]);
    expect(result.warnings).toEqual([
      "Papers for “Reinforcement learning” couldn't be found right now.",
    ]);
  });

  it("reuses papers for unchanged searches when revising", async () => {
    const search = vi.fn().mockResolvedValue([paper("NEW")]);
    const previous = {
      ...plan,
      generatedAt: "2026-01-01",
      stages: [{ ...plan.stages[0], papers: [paper("OLD")] }],
    } as Roadmap;
    const result = await buildRoadmap({ idea: "quantum RL", previous }, undefined, {
      plan: async () => plan,
      provider: { name: "openalex", search },
    });
    expect(result.roadmap.stages[0].papers[0].id).toBe("OLD");
    expect(search).toHaveBeenCalledTimes(1); // only the new stage searched
  });
});

describe("roadmapPrompt", () => {
  it("asks for a new plan, or a revision with the current roadmap and discussion", () => {
    expect(roadmapPrompt({ idea: "quantum RL" })).toContain("Research idea:\nquantum RL");
    const revision = roadmapPrompt({
      idea: "quantum RL",
      previous: { ...plan, generatedAt: "x", stages: [{ ...plan.stages[0], papers: [] }] },
      conversation: [{ role: "user", content: "Skip the basics" }],
    });
    expect(revision).toContain("Revise the current roadmap");
    expect(revision).toContain("Person: Skip the basics");
    expect(revision).not.toContain('"papers"');
  });
});

describe("roadmapToMarkdown", () => {
  it("formats stages as checklists with linked papers", () => {
    const markdown = roadmapToMarkdown({
      ...plan,
      generatedAt: "2026-10-24T12:00:00.000Z",
      stages: [
        {
          ...plan.stages[0],
          papers: [paper("A", { title: "Deep [RL]", openAccessPdfUrl: "https://x.org/a.pdf" })],
        },
        { ...plan.stages[1], papers: [] },
      ],
    });
    expect(markdown.startsWith("> Understand quantum approaches")).toBe(true);
    expect(markdown).toContain("## 1. Reinforcement learning");
    expect(markdown).toContain("- [ ] **Policy gradient**: Core training method.");
    expect(markdown).toContain(
      "- [ ] [Deep RL](https://openalex.org/A) (Lovelace et al., 2020) · [PDF](https://x.org/a.pdf)",
    );
    expect(markdown).toContain("No papers found yet. Search for “Grover amplitude amplification”.");
    expect(markdown).toContain("on 2026-10-24");
  });
});
