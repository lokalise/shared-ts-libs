# Common background jobs library

This library provides a basic abstraction over BullMQ-powered background jobs. There are two types available:

- AbstractBackgroundJobProcessor: a base class for running jobs, it provides a NewRelic and logger integration plus
  basic API for enqueuing jobs.
- AbstractStepBasedJobProcessor: a base class for step-based jobs. Logic has to be defined in classes that implement
  a `JobStep` interface and have a job data which extends `StepBasedJobData` type

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

See test implementations in `./test/processors` folder. Extend either `AbstractBackgroundJobProcessor` or
`AbstractStepBasedJobProcessor` and implement required methods.

### Common jobs

For that type of jobs, you will need to extend `AbstractBackgroundJobProcessor` and implement a `processInternal` method.
It will be called when a job is dequeued. Processing logic is automatically wrapped into NewRelic and basic logger calls,
so you only need to add your domain logic.

Both queue and worker is automatically started when you instantiate the processor. There is a default configuration which
you can override by passing `queueConfig.queueOptions` and `workerOptions` params to the constructor.

Use `dispose()` to correctly stop processing any new messages and wait for the current ones to finish.

### Step-based jobs

To create a step-based job, extend the `AbstractStepBasedJobProcessor`. This is a more complex type of job processor (based on the previous one) - it can only run via specific classes which
implement the actual logic, and it has some restrictions on the job data generic type.

You will need to implement the following methods:

#### `getStepTransitions(): Record<PropertyKey, JobStep<JobData> | null>`

Define a map of your job steps here: keys correspond to the current job state (`JobData.execution.state`) and values
are instances of a `JobStep` interface or `null` values (they finish the job execution). Each step has to implement a
`run` method which returns a new `execution` object - it will replace the existing one after
the step is finished.

Example implementation:

```typescript
protected getStepTransitions(): Record <string | number, JobStep<TestJobData> | null> {
  return {
    initial: new StepFirst(),
    'other-state': new StepSecond(),
    completed: null,
  }
}
```

In the example above (depending on the `getDefaultExecutionState` implementation), the job will start in the `initial`
state and proceed as follows:

1. `StepFirst` will be executed
2. (if `execution.state` has changed to `other-state`) `StepSecond` will be executed
3. (if `execution.state` has changed to `completed`) the job will be finished

#### `getDefaultExecutionState(): JobData['execution']`

Define the default job execution state here. It will be used when a job is scheduled.

#### `onError(error: Error | unknown, job: Job<JobData>): Promise<void>`

Define the error handler here. It will be called when any of the steps throws an exception.
