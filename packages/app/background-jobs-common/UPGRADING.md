# Upgrading Guide

## Upgrading from `15.x.x` to `16.0.0`

### Description of Breaking Changes

1. **`zod` peer floor raised to `>=4.5.0 <5.0.0`.**
  - `zod` 4.5 is where ahead-of-time schema compilation landed, and the library now relies on it. Upgrade `zod` first
    if you are still on 3.x, or on 4.x below 4.5.

2. **Registered job payload schemas are precompiled automatically.**
  - The `jobPayloadSchema` of every `QueueConfiguration` is compiled when the configuration is registered, so payload
    validation in `QueueManager`, `FlowManager` and the job processors takes zod's generated fast path. Parsing
    behavior does not change, only its speed.

3. **Precompiling a schema yourself is now a type error.**
  - `QueueConfiguration.jobPayloadSchema` rejects an already precompiled schema. If you were calling `z.compile()`
    before handing a schema over, drop the call and pass the original schema.

4. **`getQueueConfig()` returns a copy, not the object you registered.**
  - `QueueConfigRegistry.getQueueConfig()`, `QueueRegistry.getQueueConfig()` and `QueueManager.getQueueConfig()` hand
    back a shallow copy of the configuration whose `jobPayloadSchema` is the precompiled counterpart. The config
    object and the schema you passed in are left untouched.

### Migration Steps

- Bump `zod` to `>=4.5.0`.
- Remove any `z.compile()` call applied to a `jobPayloadSchema`.
- Replace reference-equality assertions on `getQueueConfig()` results (`expect(config).toBe(MY_CONFIG)`) with
  content comparisons.

## Upgrading from `4.0.0` to `5.0.0`

### Description of Breaking Changes

1. **Property Removal**
  - The deprecated `processCalls` property from `FakeBackgroundJobProcessor` has been removed.

2. **Method Changes in `AbstractBackgroundJobProcessor`**
  - The method `getActiveQueueIds` has been removed. A new constant method now serves this purpose, please check
    [Migration Steps](#migration-steps) for more info.
  - `logJobStarted` and `logJobFinished` methods are no longer public. The SDK now offers basic logging, and there are
    alternative ways to extend logging if needed, please check [Migration Steps](#migration-steps) for more info.
  - The method `resolveExecutionLogger` can no longer be overridden. The SDK will now automatically create the 
    recommended logger.

3. **Visibility Changes for Constants and Methods**
  - The following constants were not designed to be public and are no longer accessible:
    - `RETENTION_COMPLETED_JOBS_IN_AMOUNT`
    - `RETENTION_FAILED_JOBS_IN_DAYS`
    - `RETENTION_QUEUE_IDS_IN_DAYS`
  - The following methods were not designed to be public and are no longer accessible:
    - `daysToSeconds`
    - `daysToMilliseconds`
    - `isUnrecoverableJobError`
    - `sanitizeRedisConfig`


### Migration Steps

#### For `FakeBackgroundJobProcessor`
- If you were using the `processCalls` property, you should remove it and switch to using the spy feature which was 
  introduced in an earlier version (Please check the Spies section on README for more information).

#### For `AbstractBackgroundJobProcessor`
- **Replacing `getActiveQueueIds`:**
  - Replace any usage of `getActiveQueueIds` with the new public method `backgroundJobProcessorGetActiveQueueIds`.
- **Logging with `logJobStarted` and `logJobFinished`:**
  - As these methods are no longer public, extend the logged data using `requestContext.logger` on hooks (`onSucess` and `onFailed`) or
    `process` methods.
- **Custom Logger with `resolveExecutionLogger`:**
  - Since overriding `resolveExecutionLogger` is no longer possible, pass your custom logger (e.g., `logger.child`) 
    through the constructor.

#### Constants and Methods No Longer Public
- Evaluate the necessity of each constant or method no longer public. If you still need to use them, consider 
  implementing custom versions or open an issue to discuss your use case.