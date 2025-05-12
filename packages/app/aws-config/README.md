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

- `AWS_REGION` (required): AWS region where resources will be created and requests are sent (e.g., `us-east-1`).
- `AWS_KMS_KEY_ID` (optional): ID or ARN of the AWS KMS key used to encrypt SNS topics and SQS queues. If omitted,
 the default AWS-managed key is used.
- `AWS_ALLOWED_SOURCE_OWNER` (optional): AWS account ID permitted as the source owner for cross-account SNS 
 subscriptions, helping restrict unauthorized message publishers.
- `AWS_ENDPOINT` (optional): Custom endpoint URL for AWS services, commonly used for local testing with tools like 
 LocalStack (e.g., `http://localhost:4566`).
- `AWS_RESOURCE_PREFIX` (optional): Prefix applied to all AWS resource names to avoid naming collisions or support 
 multi-tenancy. See **Resource Prefix** below for details. Maximum allowed prefix length is 12 characters.
- `AWS_ACCESS_KEY_ID` & `AWS_SECRET_ACCESS_KEY` (optional): AWS credentials for programmatic access. If unset, the AWS 
 SDK's default credential provider chain (environment variables, shared credentials file, EC2 instance metadata, etc.)
 is used.

### Resource Prefix

Apply the configured resource prefix:

```ts
import { applyAwsResourcePrefix } from '@lokalise/aws-config';

const fullName = applyAwsResourcePrefix('my-resource', awsConfig);
```

**How it works:**  
The resource prefix is defined by the `AWS_RESOURCE_PREFIX` environment variable. When set, it is prepended to resource 
names using an underscore. For example:

```ts
applyAwsResourcePrefix('orders', awsConfig) // returns 'tenant123_orders' when AWS_RESOURCE_PREFIX='tenant123'
```

This helps:
- Prevent naming collisions across environments, accounts, or tenants  
- Support multi-tenancy by isolating each tenant’s resources  

If no prefix is provided, the original resource name is returned unchanged. Note that the prefix contributes to the total resource name length, which must comply with AWS service limits.

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
  - At runtime, the `MessageQueueToolkitSnsOptionsResolver` will resolve consumer/publisher options with a **CreateTopic** command 
   (with name prefixing, tags, KMS settings) and set up subscriptions for your queues and any external apps.

- **External Topics** (`isExternal: true`)
  - The SNS topic is pre‑existing and managed outside your application.
  - `TopicConfig` includes `topicName`, `isExternal: true`, and your `queues`, but **must omit** `owner`, `service`, 
   and `externalAppsWithSubscribePermissions`.
  - At runtime, the resolver will return consumer/publisher options with a `LocatorConfig` for the existing topic by name 
  - and subscribe your queues. **No topic creation or tagging** is attempted.

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

#### Request Context Pre-handler

When processing messages, the resolver automatically injects a **request context pre-handler** to each handler. This pre-handler populates a `requestContext` object with:
- `reqId`: the SNS message metadata correlation ID
- `logger`: a child logger instance scoped with the correlation ID (under `x-request-id`)

Please refer to `@message-queue-toolkit` documentation for more details on how to use the pre-handler output in your
event handlers.

#### Opinionated Defaults

`MessageQueueToolkitSnsOptionsResolver` applies opinionated defaults to reduce boilerplate:
- **Default message type field**: `'type'`, used for filtering and routing messages.
- **Publisher**:
  - `updateAttributesIfExists`: `true` (updates tags and config on existing topics).
  - `forceTagUpdate`: `false`.
  - Applies standardized tags, see tags section above.
- **Consumer**:
  - Dead-letter queue automatically created with suffix `-dlq`, `redrivePolicy.maxReceiveCount = 5`, retention = 7 days.
  - `maxRetryDuration`: 2 days for in-flight message retries.
  - `heartbeatInterval`: 20 seconds for visibility timeout heartbeats.
  - `updateAttributesIfExists`: `true` (updates tags/config if queue exists).
  - Subscription filters generated based on the message type field.
  - Resource prefixing and tagging applied uniformly to topics and queues.
  - In test mode (`isTest = true`):
    - Skips DLQ creation.
    - Sets `deleteIfExists: true` to remove resources after tests.
    - `terminateVisibilityTimeout`: `true` for immediate retries.
