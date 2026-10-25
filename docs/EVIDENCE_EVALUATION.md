# Evidence check evaluation

The explanation workspace lets readers label each cited claim as supported, contradicted, or
unclear. These labels stay in this browser. “Export reviewed examples and source passages” downloads a JSON set with
the claim, quote, surrounding page passage, and reader's label. The export includes document text;
keep it private if the document is private.

The workspace reports how many reviewed claims matched the AI verdict. This is agreement on a
**selected sample**, not general accuracy: readers may be more likely to label mistakes.

To rerun the verifier on an exported set in PowerShell:

```powershell
$env:GEMINI_API_KEY = "your-key"
$env:EVIDENCE_EVAL_FILE = "C:\path\to\evidence-reviews.json"
npm run eval:evidence
```

The command checks examples in batches of five, prints the expected and model verdict for each,
reports overall agreement and supported precision, and fails below 80% agreement. Each run makes
Gemini API calls. If `EVIDENCE_EVAL_FILE` is unset, it uses
`tests/fixtures/evidence-evaluation.json`, six synthetic starter cases with provisional labels.
Those cases exercise the runner; they are not a substitute for reader-reviewed examples. Review
exported labels and passages before treating the result as a quality measure.
