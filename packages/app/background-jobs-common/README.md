# Common background jobs library

This library provides a basic abstraction over BullMQ-powered background jobs. There are two types available:

- AbstractBackgroundJobProcessor: a base class for running jobs, it provides an instrumentation and logger integration plus
  basic API for enqueuing jobs.

## Getting Started

Install all dependencies:

```shell
npm install
```

Start Docker containers:
```shell
docker compose up -d
```

Run all tests:

```shell
npm run test
```

## Deprecation notice

`AbstractBackgroundJobProcessor` is deprecated and will be removed in the future. Please use
`AbstractBackgroundJobProcessorNew` instead. The major difference between the two is that
`AbstractBackgroundJobProcessorNew` does no queue management, so you need a separate `QueueManager` instance to manage
the queue.

## Usage

See test implementations in `./test/processors` folder. Extend `AbstractBackgroundJobProcessorNew` and `QueueManager` to
implement required methods.

```typescript
const supportedQueues = [
  {
    queueId: 'queue1',
    jobPayloadSchema: z.object({
      id: z.string(),
      value: z.string(),
      metadata: z.object({
        correlationId: z.string(),
      }),
    }),
  }
] as const satisfies QueueConfiguration[]

const queueManager = new QueueManager(supportedQueues, {
  redisConfig: config.getRedisConfig(),
  isTest: false,
  lazyInitEnabled: false,
})
await queueManager.start()

const processor = new FakeBackgroundJobProcessorNew<typeof supportedQueues, 'queue1'>(
  deps,
  'queue1',
)
await processor.start()

const jobId = await queueManager.schedule('queue1', {
  id: randomUUID(),
  value: 'test',
  metadata: { correlationId: randomUUID() },
})
```

There's also a way to start only specific queues providing an array of queue names to the `start` method.

```typescript
await queueManager.start(['queue1'])
```

### Queue Configuration

To set up a queue configuration, you need to define a list of objects containing the following properties:

- **`queueId`**: The unique identifier for the queue.
- **`queueOptions`**: Options for the queue. Refer to the [BullMQ documentation](https://docs.bullmq.io/guide/queues) for more details.
- **`jobPayloadSchema`**: A Zod schema that defines the structure of the jobs payload for this queue.
- **`jobOptions`**: Default options for jobs in this queue. See [BullMQ documentation](https://docs.bullmq.io/guide/job-options).

#### Job Deduplication

To enable job deduplication, following BullMQ doc you should define a `deduplication.id` for the job within `jobOptions`.
However, this approach can be inflexible. Therefore, `QueueConfiguration` allows you to specify a `deduplication.idBuilder`,
it is callback that accepts the job payload and returns a unique string used as the deduplication ID.

```typescript
const supportedQueues = [
  {
    queueId: 'queue_valid',
    jobPayloadSchema: z.object({
      id: z.string(),
      value: z.string(),
      metadata: z.object({ correlationId: z.string() }),
    }),
    jobOptions: {
      deduplication: {
        idBuilder: (jobData: any) => `${jobData.id}:${jobData.value}`,
      },
    },
  },
] as const satisfies QueueConfiguration[]
```

### Do not report UnrecoverableError

By default, unrecoverable errors (BullMQ) are passed to the error reporting system. If you want to disable this behavior,
throw `MutedUnrecoverableError` error instead. This will prevent the error from being reported and job will not be retried.

```ts
import { MutedUnrecoverableError } from '@lokalise/background-jobs-common'

export class Processor extends AbstractBackgroundJobProcessorNew<Data> {
  constructor(dependencies: BackgroundJobProcessorNewDependencies<Data>) {
    super(dependencies)
  }

  protected async process(
    _job: Job<JobPayloadForQueue<QueueConfiguration, QueueId>>,
    _requestContext: RequestContext,
  ): Promise < void > {
    doSomeProcessing();

    throw new MutedUnrecoverableError('Do not retry the job, and do not report the error')
  }
}
```

### Common jobs

For that type of job, you will need to extend `AbstractBackgroundJobProcessorNew` and implement a `processInternal`
method. It will be called when a job is dequeued. Processing logic is automatically wrapped into NewRelic and basic
logger calls, so you only need to add your domain logic.

By default, the worker is automatically started when you instantiate the processor. There is a default configuration which
you can override by passing `workerOptions` params to the constructor.

Similarly, queues are automatically started when you instantiate a queue manager providing a list of queues.

Use `dispose()` to correctly stop processing any new messages and wait for the current ones to finish.

### Spies

Testing asynchronous code can be challenging. To tackle this, we've developed an integrated spy feature for both jobs 
and queue managers. This functionality enables you to monitor a job as it transitions to a specific state. 

Additionally, the spy instance is shared between the processor and the queue manager, allowing you to use either
component to verify the status of a job.

#### Example Usage

```typescript
const scheduledJobIds = await queueManager.scheduleBulk(queueId, [
  {
    id: randomUUID(),
    value: 'first',
    metadata: { correlationId: generateMonotonicUuid() },
  },
  {
    id: randomUUID(),
    value: 'second',
    metadata: { correlationId: randomUUID() },
  },
]);

const firstScheduledJob = await queueManager.getSpy(queueId).waitForJobWithId(scheduledJobIds[0], 'scheduled');
// or using processor spy
// const firstScheduledJob = await processor.spy.waitForJobWithId(scheduledJobIds[0], 'scheduled');


const firstJob = await processor.spy.waitForJobWithId(scheduledJobIds[0], 'completed');
// or using queue manager spy
// const firstJob = await queueManager.getSpy(queueId).waitForJobWithId(scheduledJobIds[0], 'completed');
const secondJob = await processor.spy.waitForJob(
  (data) => data.value === 'second',
  'completed'
);

expect(firstScheduledJob.data.value).toBe('first');
expect(firstJob.data.value).toBe('first');
expect(secondJob.data.value).toBe('second');
```

#### Spy Methods

- `processor.spy.waitForJobWithId(jobId, status)`, `queueManager.getSpy(queueId).waitForJobWithId(jobId, status)`:
  - Waits for a job with a specific ID to reach the specified status.
  - Returns the job instance when the status is achieved.

- `processor.spy.waitForJob(predicate, status)`, `queueManager.getSpy(queueId).waitForJob(predicate, status)`:
  - Waits for any job that matches the custom predicate to reach the specified status.
  - Returns the matching job instance when the status is achieved.

#### Awaitable Job States

Spies can await jobs in the following states:

- `scheduled`: The job is scheduled but not yet processed.
- `failed`: The job is processed but failed.
- `completed`: The job is processed successfully.

#### Important Notes

- Spies do not need to be invoked before the job is processed, accommodating the unpredictability of asynchronous operations.
- Even if you call `await processor.spy.waitForJobWithId(scheduledJobId[], {state})` after the job has already been scheduled or processed, the spy can still resolve the job state for you.
- Spies are disabled in production.
  - To enable them, set the `isTest` option of `BackgroundJobProcessorConfig` to `true` in your processor configuration.

By utilizing these spy functions, you can more effectively manage and test the behavior of asynchronous jobs within your system.


### Barriers

In case you want to conditionally delay execution of the job (e. g. until some data necessary for processing the job arrives, or until amount of jobs in the subsequent step go below the threshold), you can use the `barrier` parameter, which delays the execution of the job until a specified condition passes.

Barrier looks like this:

```ts
const barrier = async(_job: Job<JobData>) => {
          if (barrierConditionIsPassing) {
            return {
              isPassing: true,
            }
          }

          return {
            isPassing: false,
            delayAmountInMs: 30000, // retry in 30 seconds
          }
        }
```

You pass it as a part of AbstractBackgroundJobProcessor `config`.

You can also pass over some dependencies from the processor to the barrier:

```ts
class myJobProcessor extends AbstractBackgroundJobProcessor<Generics> {
    protected override resolveExecutionContext(): ExecutionContext {
        return {
            userService: this.userService
        }
    }
}
```

This will be passed to the barrier:

```ts
const barrier = async(_job: Job<JobData>, context: ExecutionContext) => {
          if (await context.userService.userExists(job.data.userId)) {
            return {
              isPassing: true,
            }
          }

          return {
            isPassing: false,
            delayAmountInMs: 30000, // retry in 30 seconds
          }
        }
```

### Available prebuilt barriers

`@lokalise/background-jobs-common` provides one barrier out-of-the-box - a JobQueueSizeThrottlingBarrier, which is used to control amount of jobs that are being spawned by a job processor (in a different queue).

Here is an example usage:

```ts
import { createJobQueueSizeThrottlingBarrier } from '@lokalise/background-jobs-common'    

const processor = new MyJobProcessor(
        dependencies, {
          // ... the rest of the config
          barrier: createJobQueueSizeThrottlingBarrier({
            maxQueueJobsInclusive: 2, // optimistic limit, if exceeded, job with the barrier will be delayed
            retryPeriodInMsecs: 30000, // job with the barrier will be retried in 30 seconds if there are too many jobs in the throttled queue
          })
        })
await processor.start()
```

Note that throttling is based on an optimistic check (checking the count and executing the job that uses the barrier is not an atomic operation), so potentially it is possible to go over the limit in a highly concurrent system. For this reason it is recommended to set the limits with a buffer for the possible overflow.

This barrier depends on defining the following ExecutionContext: 

```ts
import type { JobQueueSizeThrottlingBarrierContext } from '@lokalise/background-jobs-common'

class myJobProcessor extends AbstractBackgroundJobProcessor<Generics> {
    protected override resolveExecutionContext(): JobQueueSizeThrottlingBarrierContext {
        return {
          throttledQueueJobProcessor: this.throttledQueueJobProcessor, // AbstractBackgroundJobProcessor
        }
    }
}
```


### Queue events.
The library optimized the default event stream settings to save memory. Specifically, the library sets the default
maximum length of the BullMQ queue events stream to `0` ([doc](https://docs.bullmq.io/guide/events)). This means the 
event stream will not store any events by default, greatly reducing memory usage.

If you need to store more events in the stream, you can easily configure the maximum length via the `queueOptions`
parameter during the processor creation.

```ts
export class Processor extends AbstractBackgroundJobProcessor<Data> {
    constructor(dependencies: BackgroundJobProcessorDependencies<Data>) {
        super(dependencies, {
            queueId: 'queue',
            ownerName: 'example owner',
            queueOptions: {
                streams: {events:{maxLen: 1000}},
            }
        })
    }
    // ...
}
```
