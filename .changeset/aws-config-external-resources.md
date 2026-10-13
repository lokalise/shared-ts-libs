---
"@lokalise/aws-config": major
---

Support resources managed outside the application, and create them in test mode.

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
