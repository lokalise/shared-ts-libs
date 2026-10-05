---
"@lokalise/aws-config": major
---

Support resources managed outside the application, and create them in test mode.

- Requires `@message-queue-toolkit/sns` >= 27.2.0.
- Queues on external topics can be external (`isExternal: true`). The queue and its subscription are only located, and
  the consumer only manages the subscription filter policy. External queues are not allowed on internal topics.
- External queues keep their redrive policy: the DLQ is only located, so `sqs:SetQueueAttributes` is no longer needed.
- `ExternalQueueConfig` no longer accepts `owner` or `service`.
- Startup resource polling is disabled in `production` and `staging`, so startup fails fast when a located resource
  is missing. In `development` it polls every 30 seconds without timeout.
- In test mode, external topics and queues are created (without tags), so tests don't depend on other services.
- SNS consumers need `sns:ListSubscriptionsByTopic` and `sns:GetSubscriptionAttributes`.
