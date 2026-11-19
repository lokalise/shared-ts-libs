# @lokalise/aws-config

## 11.0.0

### Major Changes

- 705d59d: Remove the ConfigScope-based `getAwsConfig()` (use `getEnvaseAwsConfig()` instead) and require `envase` >=2.0.0 as a peer dependency. `AWS_CONFIG_ENV_VARS` and the `AwsConfig` type are unchanged.
- 705d59d: `getEnvaseAwsConfig()` fragments must now be nested under a key in `createConfig()` (`aws` by default, or the `path` option); spreading them at the root level is no longer supported. `EnvaseAwsConfigComputedType` now takes the nesting key as its type parameter instead of the raw config shape.

### Patch Changes

- 705d59d: Mark `AWS_SECRET_ACCESS_KEY` as sensitive in the envase schema, so its value is redacted from validation errors and flagged in generated env docs.

## 10.0.0

### Major Changes

- 460c6a7: Support resources managed outside the application, and create them in test mode.
  
  - Raises peer dependencies: `@message-queue-toolkit/sns` >= 27.2.0, `@message-queue-toolkit/sqs` >= 27.1.0
    (needed for external DLQs without a redrive policy), `@message-queue-toolkit/core` >= 27.0.0 and
    `@lokalise/node-core` >= 14.0.0.
  - Queues on external topics can be external (`isExternal: true`). The queue and its subscription are only located, and
    the consumer only manages the subscription filter policy. External queues are not allowed on internal topics.
  - External queues keep their redrive policy: the DLQ is only located and is no longer attached to the queue, so
    `sqs:SetQueueAttributes` is no longer needed. Before upgrading, make sure the tooling that manages external queues
    sets their `RedrivePolicy` to the `-dlq` queue. Otherwise they have no DLQ, and messages that crash the consumer or
    exceed the visibility timeout are redelivered until they expire.
  - `ExternalQueueConfig` no longer accepts `owner` or `service`.
  - Startup resource polling is disabled in `production` and `staging`, so startup fails fast when a located resource
    is missing. Before, consumers waited in the background. Deploy services after the external resources they use
    exist, or they fail on startup until those resources are created. In `development` it polls every 30 seconds
    without timeout.
  - In test mode, external topics and queues are created (without tags), so tests don't depend on other services.
  - SNS consumers need `sns:ListSubscriptionsByTopic` and `sns:GetSubscriptionAttributes`.

## 9.1.0

### Minor Changes

- 5a873de: Configure a dead-letter queue for external SQS consumers so invalid messages are preserved instead of silently deleted.
  
  Previously, a consumer on an external queue (`isExternal: true`) resolved only a `locatorConfig` and no DLQ, so MQT's `failProcessing` was a no-op: messages failing validation (schema, unknown type, bad payload offload or codec) were deleted on their first receive and never reached the DLQ. Consumers now locate the existing DLQ by convention (`<queueName>-dlq`) so MQT can route invalid messages to it.
  
  Note for external queues: MQT (re)asserts the source queue's redrive policy on startup, so the consumer's IAM role needs `sqs:SetQueueAttributes` on the external queue, the `<queueName>-dlq` must exist, and its `maxReceiveCount` must match the value configured in infrastructure (e.g. Terraform) to avoid drift.

## 9.0.0

### Major Changes

- d59ab34: Support MQT SNS/SQS 26 and route SNS subscription delivery failures to the consumer DLQ by default.
