# Healthcheck Utils

This package adds common utils that are used to work with healthchecks.

## Usage

```ts
// this is a part of dependencies
const store = new HealthcheckResultsStore({
    maxHealthcheckNumber: 10,
    healthCheckResultTtlInMsecs: 40000,
})

const job = new HealthcheckRefreshJob(dependencies, healthcheckList, {
    intervalInMs: 15000,
})

await job.asyncRegister()
```
