# @lokalise/aws-config

## 9.1.0

### Minor Changes

- 5a873de: Configure a dead-letter queue for external SQS consumers so invalid messages are preserved instead of silently deleted.
  
  Previously, a consumer on an external queue (`isExternal: true`) resolved only a `locatorConfig` and no DLQ, so MQT's `failProcessing` was a no-op: messages failing validation (schema, unknown type, bad payload offload or codec) were deleted on their first receive and never reached the DLQ. Consumers now locate the existing DLQ by convention (`<queueName>-dlq`) so MQT can route invalid messages to it.
  
  Note for external queues: MQT (re)asserts the source queue's redrive policy on startup, so the consumer's IAM role needs `sqs:SetQueueAttributes` on the external queue, the `<queueName>-dlq` must exist, and its `maxReceiveCount` must match the value configured in infrastructure (e.g. Terraform) to avoid drift.

## 9.0.0

### Major Changes

- d59ab34: Support MQT SNS/SQS 26 and route SNS subscription delivery failures to the consumer DLQ by default.
