# @lokalise/fastify-bullboard-plugin

## 3.0.0

### Major Changes

- b52200e: Upgrade `@bull-board/api` and `@bull-board/fastify` to 9, which adds BullMQ 6 support and ships a redesigned
  dashboard UI.
  
  `QueueConstructor` no longer declares the third constructor parameter. BullMQ 6 replaced it (`Connection`) with
  a `BackendFactory`, and the plugin never passed it, so the type now matches `QueueProConstructor` and accepts
  BullMQ's `Queue` on both majors.

## 2.3.1

### Patch Changes

- cb71fd6: Retrigger release after fixing the changesets publish step, which failed with EBADDEVENGINES when npm validated the pnpm devEngines constraint.

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
