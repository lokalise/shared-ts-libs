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

## Pull-request descriptions

Every PR you open (or help open) **must** end with this exact block, with the "Yes" box checked:

```markdown
## AI Assistance Tracking

We're running a metric to understand where AI assists our engineering work. Please select exactly one of the options below:

Mark "Yes" if AI helped in any part of this work, for example: generating code, refactoring, debugging support, explaining something, reviewing an idea, or suggesting an approach.

- [x] **Yes, AI assisted with this PR**
- [ ] **No, AI did not assist with this PR**
```
