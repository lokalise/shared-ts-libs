# @lokalise/biome-config

Lokalise config for Biome

## Getting started

Requires `@biomejs/biome` 2.6.3 or later.

`biome-base.jsonc` lints and formats TypeScript, JSON, Markdown and YAML, and skips files listed in `.gitignore`. It also skips files that tools write: `package-lock.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `CHANGELOG.md` and `.changeset/*.md`. If your own `files.includes` adds `"**"`, repeat the exclusions you need after it.

You can use the following biome.json configurations:

Backend:

```json
{
  "$schema": "./node_modules/@biomejs/biome/configuration_schema.json",
  "extends": [
    "./node_modules/@lokalise/biome-config/configs/biome-base.jsonc",
    "./node_modules/@lokalise/biome-config/configs/biome-esm.jsonc"
  ]
}
```

Packages:

```json
{
  "$schema": "./node_modules/@biomejs/biome/configuration_schema.json",
  "extends": [
    "./node_modules/@lokalise/biome-config/configs/biome-base.jsonc",
    "./node_modules/@lokalise/biome-config/configs/biome-package.jsonc"
  ]
}
```

Frontend:

```json
{
  "$schema": "./node_modules/@biomejs/biome/configuration_schema.json",
  "extends": [
    "./node_modules/@lokalise/biome-config/configs/biome-base.jsonc",
    "./node_modules/@lokalise/biome-config/configs/biome-frontend.jsonc"
  ]
}
```
