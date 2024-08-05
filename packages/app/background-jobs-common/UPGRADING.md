# Upgrading Guide

## Upgrading from `4.0.0` to `5.0.0`

### Description of Breaking Changes

1. **Property Removal**
  - The deprecated `processCalls` property from `FakeBackgroundJobProcessor` has been removed.

2. **Method Changes in `AbstractBackgroundJobProcessor`**
  - The method `getActiveQueueIds` has been removed. A new constant method now serves this purpose.
  - `logJobStarted` and `logJobFinished` methods are no longer public. The SDK now offers basic logging, and there are
    alternative ways to extend logging if needed.
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
  introduced in an earlier version.

#### For `AbstractBackgroundJobProcessor`
- **Replacing `getActiveQueueIds`:**
  - Replace any usage of `getActiveQueueIds` with the new public method `backgroundJobProcessorGetActiveQueueIds`.
- **Logging with `logJobStarted` and `logJobFinished`:**
  - As these methods are no longer public, extend the logged data using hooks or within the `process` method.
- **Custom Logger with `resolveExecutionLogger`:**
  - Since overriding `resolveExecutionLogger` is no longer possible, pass your custom logger (e.g., `logger.child`) 
    through the constructor.

#### Constants and Methods No Longer Public
- Evaluate the necessity of each constant or method no longer public. If you still need to use them, consider 
  implementing custom versions or open an issue to discuss your use case.