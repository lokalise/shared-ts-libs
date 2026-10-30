---
"@lokalise/biome-config": minor
---

`biome-base.jsonc` now formats Markdown and YAML, skips files listed in `.gitignore`, and requires Biome 2.6.3 or later.

- Formats `**/*.md`, `**/*.yml` and `**/*.yaml`, and keeps the YAML front matter of Markdown files (`markdown.parser.frontmatter`).
- Skips files that tools write: `package-lock.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `CHANGELOG.md` and `.changeset/*.md`.
- Enables `vcs.useIgnoreFile`, so Biome skips files listed in `.gitignore`.
- Adds `@biomejs/biome` `^2.6.3` as a peer dependency. Biome 2.5 fails with `Found an unknown key 'markdown'`.

To migrate:

1. Upgrade `@biomejs/biome` to `^2.6.3` and this package.
2. If your `files.includes` adds `"**"`, it includes the excluded files again. Repeat the exclusions you need after it, for example `"!**/CHANGELOG.md"`.
3. Run `biome check --write`, then review the Markdown diff. Biome 2.6.3 can change how some lists render:
   - A sub-list indented with 4 spaces under a numbered item becomes nested one level deeper per item. Indent it with 3 spaces before formatting.
   - A list item that ends with two trailing spaces can lose the blank line after the list. Run `biome check --write` twice, and add the blank line back if the next paragraph moved into the list.
