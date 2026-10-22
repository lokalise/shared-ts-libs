---
"@lokalise/prettier-config": major
"@lokalise/eslint-config": patch
---

`@lokalise/prettier-config` now indents with 2 spaces instead of tabs, matching `@lokalise/biome-config` v4. `printWidth`, `singleQuote` and `semi` are unchanged, and `trailingComma: "all"` (already Prettier 3's default) is now set explicitly.

To migrate, upgrade the package and run `prettier --write .` to reformat existing files.

`@lokalise/eslint-config` source files are reformatted with the new config; no rule changes.
