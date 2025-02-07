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

See test implementations in `./test/processors` folder. Extend `AbstractBackgroundJobProcessorNew` and `Queuemanager` to
implement required methods.

```typescript
const jobRegistry = new JobRegistry([
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
])

const queueManager = new FakeQueueManager([{ queueId: 'queue1' }], jobRegistry, {
  redisConfig: config.getRedisConfig(),
})
await queueManager.start()

const processor = new FakeBackgroundJobProcessorNew<JobPayload>(
        deps,
        'queue1',
        config.getRedisConfig(),
)
await processor.start()

const jobId = await queueManager.schedule('queue1', {
    id: randomUUID(),
    value: 'test',
    metadata: { correlationId: generateMonotonicUuid() },
})
```

### Common jobs

For that type of jobs, you will need to extend `AbstractBackgroundJobProcessorNew` and implement a `processInternal`
method. It will be called when a job is dequeued. Processing logic is automatically wrapped into NewRelic and basic
logger calls, so you only need to add your domain logic.

By default, worker is automatically started when you instantiate the processor. There is a default configuration which
you can override by passing `workerOptions` params to the constructor.

Similarly, queues are automatically started when you instantiate a queue manager providing a list of queues and job
registry.

If you wish to only enable your processor to interact with the queue, but not process any jobs, you can set the
`workerAutoRunEnabled` param to `false` in the constructor, which equals to setting `autorun` to `false` in
`workerOptions`. While you'd normally want the worker to always be running, there are particular occasions where it is
advisable to not start it automatically. This is the case when, for example, you are starting a separate instance of
your application to schedule a job, but do not want for this instance to start processing this or any other job
in the queue because they should be instead picked up by the main instance.

Use `dispose()` to correctly stop processing any new messages and wait for the current ones to finish.

### Spies

Testing asynchronous code can be challenging. To address this, we've implemented a built-in spy functionality for
jobs and queue managers.

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

const firstScheduledJob = await queueManager.spy.waitForJobWithId(scheduledJobIds[0], 'scheduled');

const firstJob = await processor.spy.waitForJobWithId(scheduledJobIds[0], 'completed');
const secondJob = await processor.spy.waitForJob(
  (data) => data.value === 'second',
  'completed'
);

expect(firstScheduledJob.data.value).toBe('first');
expect(firstJob.data.value).toBe('first');
expect(secondJob.data.value).toBe('second');
```

#### Spy Methods

- `processor.spy.waitForJobWithId(jobId, status)`, `queueManager.spy.waitForJobWithId(jobId, status)`:
  - Waits for a job with a specific ID to reach the specified status.
  - Returns the job instance when the status is achieved.

- `processor.spy.waitForJob(predicate, status)`, `queueManager.spy.waitForJob(predicate, status)`:
  - Waits for any job that matches the custom predicate to reach the specified status.
  - Returns the matching job instance when the status is achieved.

#### Awaitable Job States

Spies can await jobs in the following states for queue managers:

- `scheduled`: The job is scheduled but not yet processed.

Spies can await jobs in the following states for processors:

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