# @lokalise/eslint-config

## 1.3.3

### Patch Changes

- 7f00696: `@lokalise/prettier-config` now indents with 2 spaces instead of tabs, matching `@lokalise/biome-config` v4. `printWidth`, `singleQuote` and `semi` are unchanged, and `trailingComma: "all"` (already Prettier 3's default) is now set explicitly.
  
  To migrate, upgrade the package and run `prettier --write .` to reformat existing files.
  
  `@lokalise/eslint-config` source files are reformatted with the new config; no rule changes.

## 1.3.2

### Patch Changes

- 25fa2e5: Improve deprecation notice formatting in README to clarify recommended alternatives.
