---
"@lokalise/tsconfig": major
---

Set `compilerOptions.strict` to `true` in the base config. All presets extend `base.json`, so every consumer now gets strict mode by default instead of inheriting whatever the compiler defaults to. This pins the contract to the package rather than the TypeScript version (TS 6.0 flips `strict` to `true` by default). Consumers not yet ready for strict can opt out with `"strict": false`.
