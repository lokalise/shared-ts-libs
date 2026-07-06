# @lokalise/fastify-bullboard-plugin

## 2.3.0

### Minor Changes

- 1acf611: Update dependencies, including `@bull-board/api` and `@bull-board/fastify` to v8. The v8 major only changes the `dateFormats` API (Intl options instead of date-fns strings), which this plugin does not use, so behaviour is unchanged.

## 2.2.3

### Patch Changes

- Updated dependencies [2f42e00]
  - @lokalise/tsconfig@5.0.0

## 2.2.2

### Patch Changes

- 4d6256d: Add debug-level logging for queue discovery per Redis config, including queue count and IDs.
