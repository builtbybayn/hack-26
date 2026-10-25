import { expect, it } from "vitest";
import { studyPreview } from "./study-preview";

it("uses exact abstract sentences for study fields and leaves unsupported fields empty", () => {
  const abstract =
    "We conducted a randomized trial with 120 students. " +
    "We measured retention after six months. " +
    "Results showed improved recall.";
  expect(studyPreview(abstract)).toEqual([
    { label: "Methods", quote: "We conducted a randomized trial with 120 students." },
    { label: "Sample or data", quote: "We conducted a randomized trial with 120 students." },
    { label: "Measures", quote: "We measured retention after six months." },
    { label: "Results", quote: "Results showed improved recall." },
    { label: "Limitations", quote: null },
  ]);
  expect(studyPreview("A short follow-up limits generalization.")[4].quote).toBe(
    "A short follow-up limits generalization.",
  );
  expect(studyPreview()[0].quote).toBeNull();
});
