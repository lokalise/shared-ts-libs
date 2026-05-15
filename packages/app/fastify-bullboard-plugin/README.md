# bull-board

Bull-board is a dashboard which provided a UI built on top of BullMQ or BullMQ Pro to help you visualize
your queues and their jobs.
It gives you the possibility of visualizing what's happening with each job in your queues, their status and some actions
that will enable you to get the job done.

Internally, we are using an open source library, [bull-board](https://github.com/felixmosh/bull-board), which provides
all the functionalities we mentioned above.

## Adding bullboard to your app

Register a bullboard plugin in your fastify app:

```ts
import fastify from 'fastify'
import { bullBoard, basicAuth } from '@lokalise/fastify-bullboard-plugin'
import { Queue } from 'bullmq'

const app = fastify()

await app.register(basicAuth, {
    config: {
        isEnabled: true,
        username: 'username',
        password: 'pass',
    },
    enableList: new Set(['/bull']),
})

await app.register(bullBoard, {
  queueConstructor: Queue,
  redisConfigs: [
      {
          host: process.env.REDIS_HOST!,
          port: Number(process.env.REDIS_PORT),
          username: process.env.REDIS_USERNAME,
          password: process.env.REDIS_PASSWORD,
          keyPrefix: process.env.REDIS_KEY_PREFIX,
          useTls: false,
      } // any Redis config
  ],
  basePath: '/bull',
  refreshIntervalInSeconds: config.bullBoard.refreshIntervalInSeconds,
})
```

## BullMQ Pro support

The plugin supports both standard BullMQ queues and BullMQ Pro queues, including mixing
the two in a single deployment. Mark each Redis connection that hosts Pro queues with
`isPro: true` and provide the `QueuePro` constructor via `queueProConstructor`. Queues
discovered on Pro connections are wrapped in `BullMQProAdapter`, surfacing group-aware
counts and listings in the dashboard.

```ts
import { bullBoard } from '@lokalise/fastify-bullboard-plugin'
import { Queue } from 'bullmq'
import { QueuePro } from '@taskforcesh/bullmq-pro'

await app.register(bullBoard, {
  queueConstructor: Queue,
  queueProConstructor: QueuePro,
  redisConfigs: [
    // Standard BullMQ connection
    {
      host: process.env.REDIS_HOST!,
      port: Number(process.env.REDIS_PORT),
    },
    // BullMQ Pro connection on the same deployment
    {
      host: process.env.REDIS_PRO_HOST!,
      port: Number(process.env.REDIS_PRO_PORT),
      isPro: true,
    },
  ],
  basePath: '/bull',
})
```

`queueConstructor` is required when any `redisConfigs` entry omits `isPro` (or sets it to `false`).
`queueProConstructor` is required when any entry sets `isPro: true`. Both may be supplied together
for mixed deployments.

## Compatibility with existing fastify plugins

`@lokalise/fastify-bullboard-plugin/basicAuth` registers it own instance of `fastifyBasicAuth`, it will not work if you also have it installed in your fastify app.

It will also attempt registering `fastifyAuth` if it is not yet registered, so if you prefer to register it explicitly in your app, make sure that `@lokalise/fastify-bullboard-plugin/basicAuth` is registered after `fastifyAuth`.

`bullBoard` attempts to register `fastifySchedule` if it's not already registered, so if you are registering it explicitly in your app, make sure that `bullBoard` plugin is registered after `fastifySchedule`.
