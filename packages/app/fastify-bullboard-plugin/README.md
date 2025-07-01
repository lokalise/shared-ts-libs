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
  redisInstances: [
      new Redis({
          // some redis config
      }),
  ],
  basePath: '/bull',
  refreshIntervalInSeconds: config.bullBoard.refreshIntervalInSeconds,
})
```
