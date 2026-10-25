const fields = [
  {
    label: "Methods",
    pattern:
      /\b(randomi[sz]ed|trial|cohort|case.control|cross.sectional|survey|interview|experiment|simulation|meta.analysis|systematic review|we (?:used|conducted|performed|developed|compared))\b/i,
  },
  {
    label: "Sample or data",
    pattern:
      /\b(participants?|patients?|subjects?|students?|sample of|cohort of|datasets?|corpus of)\b/i,
  },
  {
    label: "Measures",
    pattern:
      /\b(measured|assessed|evaluated|primary outcome|secondary outcome|endpoint|metric|questionnaire|scale)\b/i,
  },
  {
    label: "Results",
    pattern:
      /\b(results?|findings?)\s+(?:show|indicat|suggest|demonstrat|revea|were)|\bwe (?:found|observed)|\b(?:improved|increased|decreased|reduced)\b/i,
  },
  {
    label: "Limitations",
    pattern:
      /\b(limitations?|limited by|small sample|short follow.up|further research|future work)\b/i,
  },
] as const;

export function studyPreview(abstract?: string) {
  const sentences = abstract
    ? [...new Intl.Segmenter("en", { granularity: "sentence" }).segment(abstract)]
        .map(({ segment }) => segment.trim())
        .filter(Boolean)
    : [];
  return fields.map(({ label, pattern }) => ({
    label,
    quote: sentences.find((sentence) => pattern.test(sentence)) ?? null,
  }));
}
