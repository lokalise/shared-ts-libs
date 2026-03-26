# @lokalise/aws-event-routing-types

Lightweight TypeScript types for AWS event routing configuration (SNS topics, SQS queues).

This package contains **only type definitions** with zero runtime dependencies. Use it when you need
to reference `EventRoutingConfig` and related types without pulling in the full `@lokalise/aws-config`
dependency tree.

## Exported types

| Type | Description |
|------|-------------|
| `EventRoutingConfig` | Top-level map of topic names → `TopicConfig` |
| `TopicConfig` | SNS topic config (internal or external) with its subscribed queues |
| `QueueConfig` | Union of `InternalQueueConfig` and `ExternalQueueConfig` |
| `InternalQueueConfig` | Queue owned and created by your application |
| `ExternalQueueConfig` | Pre-existing queue managed outside your application |
| `CommandConfig` | Map of command names → `QueueConfig` for SQS command patterns |
| `AwsTagsParams` | Parameters used to generate standardised AWS resource tags |

## Usage

```ts
import type { EventRoutingConfig, CommandConfig } from '@lokalise/aws-event-routing-types'

const routingConfig: EventRoutingConfig = {
  ordersTopic: {
    topicName: 'orders',
    owner: 'team-x',
    service: 'order-service',
    queues: {
      orderCreated: { queueName: 'order-created', owner: 'team-x', service: 'order-service' },
    },
  },
  externalTopic: {
    topicName: 'external-events',
    isExternal: true,
    queues: {
      eventQueue: { queueName: 'event-queue', owner: 'team-x', service: 'order-service' },
    },
  },
}

const commandConfig: CommandConfig = {
  processOrder: { queueName: 'process-order', owner: 'team-x', service: 'order-service' },
  externalCommand: { queueName: 'external-command-queue', isExternal: true },
}
```

For resolver implementations and full AWS resource management, see [`@lokalise/aws-config`](../aws-config/README.md).
