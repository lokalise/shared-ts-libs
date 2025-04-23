# @lokalise/aws-config

Very opinionated TypeScript library for managing AWS configuration, resource naming, tagging, event routing, 
and integration with @message-queue-toolkit/sns.

## Usage

### AWS Configuration

Read AWS configuration from environment variables:

```ts
import { getAwsConfig } from '@lokalise/aws-config';

const awsConfig = getAwsConfig();
```

Set the following environment variables:
- `AWS_REGION` (required)
- `AWS_KMS_KEY_ID` (optional)
- `AWS_ALLOWED_SOURCE_OWNER` (optional)
- `AWS_ENDPOINT` (optional)
- `AWS_RESOURCE_PREFIX` (optional)
- `AWS_ACCESS_KEY_ID` & `AWS_SECRET_ACCESS_KEY` (optional; or use default providers)

### Resource Prefix

Apply the configured resource prefix:

```ts
import { applyAwsResourcePrefix } from '@lokalise/aws-config';

const fullName = applyAwsResourcePrefix('my-resource', awsConfig);
```

### Tagging AWS Resources

Generate standardized tags for SNS and SQS:

```ts
import { getSnsTags, getSqsTags, type AwsTagsParams } from '@lokalise/aws-config';

const tagParams: AwsTagsParams = {
  appEnv: 'production',
  system: 'backend',
  owner: 'team-x',
  project: 'project-y',
  service: 'my-service',
};

const snsTags = getSnsTags(tagParams);
const sqsTags = getSqsTags(tagParams);
```

### Event Routing Configuration

Define SNS topics and SQS queues:

```ts
import type { EventRoutingConfig } from '@lokalise/aws-config';

const routingConfig: EventRoutingConfig = {
  // internal topic example (managed and created by your application)
  ordersTopic: {
    topicName: 'orders',
    owner: 'team-x',
    service: 'order-service',
    queues: {
      orderCreated: { name: 'order-created', owner: 'team-x', service: 'order-service' },
    },
    externalAppsWithSubscribePermissions: ['other-app'],
  },
  // external topic example (managed outside your application)
  externalTopic: {
    topicName: 'external-events',
    isExternal: true,
    queues: {
      eventQueue: { name: 'event-queue', owner: 'team-x', service: 'order-service' },
    },
  },
};
```

#### Internal vs. External Topics

- **Internal Topics** (default)
  - You own and manage the SNS topic.
  - `TopicConfig` must include `owner`, `service`, and optionally `externalAppsWithSubscribePermissions`.
  - At runtime, the `MessageQueueToolkitSnsOptionsResolver` will issue a **CreateTopic** command (with name prefixing, tags, 
   KMS settings) and set up subscriptions for your queues and any external apps.

- **External Topics** (`isExternal: true`)
  - The SNS topic is pre‑existing and managed outside your application.
  - `TopicConfig` includes `topicName`, `isExternal: true`, and your `queues`, but **must omit** `owner`, `service`, 
   and `externalAppsWithSubscribePermissions`.
  - At runtime, the resolver will only locate (prefix) the existing topic by name and subscribe your 
   queues—**no topic creation or tagging** is attempted.

Under the hood, the TypeScript union enforces this shape.

### Message Queue Toolkit SNS Resolver

Automatically build publisher and consumer options with `@message-queue-toolkit/sns`:

```ts
import { MessageQueueToolkitSnsOptionsResolver } from '@lokalise/aws-config';
import { getAwsConfig } from '@lokalise/aws-config';
import { logger } from '@lokalise/node-core';

const awsConfig = getAwsConfig();
const resolver = new MessageQueueToolkitSnsOptionsResolver(routingConfig, {
  appEnv: 'production',
  system: 'backend',
  project: 'order-project',
  validateNamePatterns: true,
});

const publishOpts = resolver.resolvePublisherBuildOptions({
  topicName: 'ordersTopic',
  awsConfig,
  logger,
  messageSchemas: { /* your schemas… */ },
  logMessages: true,
});

const consumeOpts = resolver.resolveConsumerBuildOptions({
  topicName: 'ordersTopic',
  queueName: 'orderCreated',
  awsConfig,
  logger,
  handlers: [ /* your handlers… */ ],
  concurrentConsumersAmount: 2,
  batchSize: 10,
  logMessages: false,
});
```
