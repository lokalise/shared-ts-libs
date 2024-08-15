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

## Usage

See test implementations in `./test/processors` folder. Extend `AbstractBackgroundJobProcessor` and implement required methods.

### Common jobs

For that type of jobs, you will need to extend `AbstractBackgroundJobProcessor` and implement a `processInternal` method.
It will be called when a job is dequeued. Processing logic is automatically wrapped into NewRelic and basic logger calls,
so you only need to add your domain logic.

Both queue and worker is automatically started when you instantiate the processor. There is a default configuration which
you can override by passing `queueConfig.queueOptions` and `workerOptions` params to the constructor.

Use `dispose()` to correctly stop processing any new messages and wait for the current ones to finish.

### Spies

Testing asynchronous code is hard. For that purpose we have implemented built-in spy functionality for jobs.
Example usage:

```ts
const scheduledJobIds = await processor.scheduleBulk([
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
])

const firstJob = await processor.spy.waitForJobWithId(scheduledJobIds[0], 'completed')
const secondJob = await await processor.spy.waitForJob(
	(data) => data.value === 'second',
	'completed',
)

expect(firstJob.data.value).toBe('first')
expect(secondJob.data.value).toBe('second')
```

Here, `processor.spy.waitForJobWithId()` returns an instance of a job with a given id, and with the expected status, and `processor.spy.waitForJob()` performs lookup by a custom predicate, accordingly.

Note that spies do not rely on being invoked before the job was processed, to account for the unpredictability of asynchronous operations. Even if you call `await processor.spy.waitForJobWithId(scheduledJobIds[0], 'completed')` after the job was already processed, spy will be able to resolve the processing result for you.

Spies are disabled in production. In order to enable them, you need to set the `isTest` option of `BackgroundJobProcessorConfig` of your processor to true.

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
    override protected resolveExecutionContext(): ExecutionContext {
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

`@lokalise/background-jobs-common` provides one barrier out-of-the-box - a ChildJobThrottlingBarrier, which is used to control amount of child jobs that are being spawned by a job processor.

Here is an example usage:

```ts
import { createJobQueueSizeThrottlingBarrier } from '@lokalise/background-jobs-common'    

const processor = new TestChildJobBarrierBackgroundJobProcessor<JobData, JobReturn>(
        dependencies, {
          // ... the rest of the config
          barrier: createJobQueueSizeThrottlingBarrier({
            maxQueueJobsInclusive: 2, // optimistic limit, if exceeded, job with the barrier will be delayed
            retryPeriodInMsecs: 30000, // job with the barrier will be retried in 30 seconds if there are too many jobs in the throttled queue
          })
        })
await processor.start()
```

Note that throttling is based on an optimistic check (checking the count and executing the parent job are not an atomic operation), so potentially it is possible to go over the limit in a highly concurrent system. For this reason it is recommended to set the limits with a buffer for the possible overflow.

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
