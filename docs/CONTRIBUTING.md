# Contributing

Short-lived branches, small PRs, frequent merges into `main`. That's the whole workflow.

## Branches

`main` is always deployable. Never commit to it directly.

```bash
git switch main && git pull
git switch -c feat/upload-history
```

| Prefix   | For                    | Example                    |
| -------- | ---------------------- | -------------------------- |
| `feat/`  | New functionality      | `feat/pdf-parser`          |
| `fix/`   | Bug fixes              | `fix/markdown-fence-split` |
| `ui/`    | Visual and layout work | `ui/landing-hero`          |
| `docs/`  | Documentation only     | `docs/api-contract`        |
| `chore/` | Tooling, deps, config  | `chore/ci-cache`           |

Use lowercase-kebab-case and keep names short. A branch should live **hours, not days**. If it is
growing, merge a working slice and continue on a new branch.

## Pull requests

1. Run `npm run check` locally (lint, typecheck, format, tests).
2. Rebase on or merge the latest `main`.
3. Open a PR and fill in the template. Keep it focused on one change.
4. Get one teammate's review. For changes to shared code (see below), get the owner's review.
5. **Squash-merge** and delete the branch.

CI must be green before merging. If it fails, fix it; don't merge around it.

## Avoiding merge conflicts

- **Stay in your lane.** Work inside your feature folder whenever possible; most conflicts come
  from several people editing the same shared file.
- **Pull `main` often.** At least every few hours, and always before opening a PR.
- **Keep shared edits small and separate.** If your feature needs a change to `src/types`,
  `src/components`, `src/lib`, or `globals.css`, make that change in its own small PR first and
  merge it quickly.
- **Don't reformat files you aren't changing.** Prettier runs on everything, so formatting is
  already consistent; unrelated diffs only create conflicts.
- **Say what you're touching** in the team chat before editing a shared file.

## Where code belongs

| Code                                       | Location                      |
| ------------------------------------------ | ----------------------------- |
| A page or route                            | `src/app/<route>/page.tsx`    |
| An API endpoint                            | `src/app/api/<name>/route.ts` |
| UI and state for one feature               | `src/features/<feature>/`     |
| A UI primitive used by 2+ features         | `src/components/`             |
| Server logic used by 2+ features           | `src/lib/<module>/`           |
| Browser-side API client or mock            | `src/lib/api/`                |
| Types shared across client/server/features | `src/types/`                  |
| Unit tests                                 | Next to the code: `*.test.ts` |
| Test fixtures                              | `tests/fixtures/`             |

Full reasoning is in [ARCHITECTURE.md](ARCHITECTURE.md).

## Ownership

These are guidelines, not access rules. Owners review changes to their areas.

| Role                          | Primarily owns                                                                |
| ----------------------------- | ----------------------------------------------------------------------------- |
| Frontend / UI                 | `src/app` (pages, layouts), `src/components`, `globals.css`, `docs/DESIGN.md` |
| Backend / shared processing   | `src/lib/ingestion`, `src/app/api`, other `src/lib` modules                   |
| Feature developers            | Their own `src/features/<feature>` folder                                     |
| Everyone (coordinate changes) | `src/types`, `src/lib/api`, configs, `docs/ARCHITECTURE.md`                   |

As the team grows, add a row here (and optionally a `CODEOWNERS` file).

## Changing shared contracts

`src/types` and the API response shapes are agreements between people working in parallel.

- **Additive changes** (a new optional field, a new endpoint) are fine in a normal PR. Mention them
  in the PR description.
- **Breaking changes** (renaming or removing a field, changing a meaning) need a heads-up in the
  team chat first. Update every consumer, the mock, and `docs/ARCHITECTURE.md` in the same PR.
- The mock-vs-real test will fail if the mock drifts from the pipeline. Fix the mock, don't skip
  the test.

## Avoiding duplicate functionality

Before writing something that sounds general (file handling, parsing, an API call, a UI widget),
check `src/lib`, `src/lib/api`, `src/types`, and `src/components` first.

- If it exists, use it. If it almost fits, extend it in a small shared PR.
- If it doesn't exist and only your feature needs it, build it in your feature folder.
- When a second feature needs it, move it to `src/lib` or `src/components`. Don't copy it.
- Once the UI owner has set up design tokens and components, use those rather than one-off styles.

## Testing expectations

- **Shared logic (`src/lib`) must have unit tests** for its happy path and its error codes.
- **Features:** test non-trivial logic (parsing, transformations, state machines). UI tests are
  optional for now.
- **Before merging:** `npm run check` passes and you have clicked through your change in
  `npm run dev`.

## Commits

Write short, imperative messages: `Add PDF parser`, `Fix fence detection in Markdown parser`.
Squash-merging means the PR title becomes the commit on `main`, so make that title clear.
