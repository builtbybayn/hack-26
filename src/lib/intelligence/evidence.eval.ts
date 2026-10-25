import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";
import { z } from "zod";
import { assessEvidenceClaims } from "./tutor";

const casesSchema = z
  .array(
    z.object({
      index: z.number().int().nonnegative(),
      claim: z.string().min(1),
      quote: z.string().min(1),
      pageNumber: z.number().int().positive(),
      passage: z.string().min(1),
      expectedVerdict: z.enum(["supported", "contradicted", "unclear"]),
    }),
  )
  .min(1);

it("checks labeled claims against the live evidence verifier", async () => {
  if (!process.env.GEMINI_API_KEY)
    throw new Error("Set GEMINI_API_KEY to run the evidence evaluation.");
  const file = resolve(process.env.EVIDENCE_EVAL_FILE ?? "tests/fixtures/evidence-evaluation.json");
  const cases = casesSchema.parse(JSON.parse(readFileSync(file, "utf8")));
  let correct = 0;
  let supportedCorrect = 0;
  let supportedCount = 0;
  for (let offset = 0; offset < cases.length; offset += 5) {
    const batch = cases.slice(offset, offset + 5);
    const checks = await assessEvidenceClaims(batch);
    for (const item of batch) {
      const verdict = checks.find((check) => check.index === item.index)?.verdict;
      if (verdict === item.expectedVerdict) correct += 1;
      if (verdict === "supported") {
        supportedCount += 1;
        if (item.expectedVerdict === "supported") supportedCorrect += 1;
      }
      console.log(`${item.index}: expected ${item.expectedVerdict}, got ${verdict}`);
    }
  }
  console.log(
    `Agreement: ${correct}/${cases.length}; supported precision: ${supportedCorrect}/${supportedCount}`,
  );
  expect(correct / cases.length).toBeGreaterThanOrEqual(0.8);
});
