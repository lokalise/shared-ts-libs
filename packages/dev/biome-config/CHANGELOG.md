# @lokalise/biome-config

## 4.0.0

### Major Changes

- a09c967: All Biome configs now format with 2-space indentation and a 100-character line width.
  
  - `biome-base.jsonc`: JSON and the default formatter use 2 spaces (was 4).
  - `biome-frontend.jsonc`: JS/TS and CSS use 2 spaces (was tabs).
  
  Linting rules are unchanged, and `@lokalise/prettier-config` still uses tabs.
  
  To migrate, upgrade the package and run `biome check --write` to reformat existing files.
