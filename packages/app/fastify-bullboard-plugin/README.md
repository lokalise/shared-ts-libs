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
  queueConstructor: Queue, // can be QueuePro if bullmq-pro is used
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

## Compatibility with existing fastify plugins

`@lokalise/fastify-bullboard-plugin/basicAuth` registers it own instance of `fastifyBasicAuth`, it will not work if you also have it installed in your fastify app.

It will also attempt registering `fastifyAuth` if it is not yet registered, so if you prefer to register it explicitly in your app, make sure that `@lokalise/fastify-bullboard-plugin/basicAuth` is registered after `fastifyAuth`.

`bullBoard` attempts to register `fastifySchedule` if it's not already registered, so if you are registering it explicitly in your app, make sure that `bullBoard` plugin is registered after `fastifySchedule`.
