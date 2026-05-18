## Project Management

- This project uses pnpm. DO NOT use npm

## Changesets

- Every PR that changes published package code needs at least ONE changeset
- Create one changeset per logical change (not per package)
- A single changeset may include multiple packages
- If a PR contains unrelated changes, use multiple changesets
- Create manually: add `.changeset/<descriptive-name>.md` with YAML front matter listing `"@lokalise/package-name": patch|minor|major` and a concise summary
- Check `.changeset/` before creating — do NOT create duplicate or overlapping changesets in the same PR
- Changeset summaries should be specific ("add drag-and-drop reordering to filter list" not "update filter list")

Example:

```md
---
"@lokalise/package-a": minor
"@lokalise/package-b": patch
---

One-line summary of what changed.
```
