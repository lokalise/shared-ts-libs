# Common background jobs library

This library provides a basic abstraction over BullMQ-powered background jobs. There are two types available:

- AbstractBackgroundJobProcessor: a base class for running jobs, it provides a instrumentation and logger integration plus
  basic API for enqueuing jobs.

## Getting Started

Install all dependencies:

```shell
npm install
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
