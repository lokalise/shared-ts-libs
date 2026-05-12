## [4.0.0] - 2026-05-05

### ⚠ Breaking Changes

- **Requires TypeScript >= 6.0.0.**
- **`rootDir` now defaults to `src/`** in all build presets (`build-app`, `build-public-lib`, `build-private-lib`).
  - Required by TypeScript v6, which no longer infers `rootDir` automatically during compilation.
  - Packages using a different source directory must override `rootDir` locally. See [README](./README.md#changing-source-and-output-directories).
- **`types` cleared in base config.**
  - Previously `["node", "vitest/globals"]` was included by default. These must now be added explicitly per package.
  - Example: `"types": ["node", "vitest/globals"]` in your `tsconfig.json`.

### Changes

- Removed `DOM.Iterable` from `tsc-dom` and `bundler-dom` configs — it is already included in the `DOM` lib in modern TypeScript versions.
- Removed `strict`, `esModuleInterop`, and `noUncheckedSideEffectImports` from base config — these are now TypeScript v6 defaults.

## [3.0.0] - 2025-09-04

### ⚠ Breaking Changes
- Updated `module` setting to `Node20` in `tsc` and `tsc-dom` configs.
  - Requires **TypeScript >= 5.9.0**.
  - More info on Node20 module support: [microsoft/TypeScript#61805](https://github.com/microsoft/TypeScript/issues/61805)
