# Metrics Utils

This package contains a set of utilities to work with Prometheus metrics.

It provides five abstract base classes, organized into two families:

- **Labeled** — one Prometheus metric with dimensions expressed as Prometheus labels.
- **Dimensional** — one Prometheus metric per dimension, with the metric name built by a caller-provided `buildMetricName(dimension)` callback. Use this when the backend consuming your metrics does not support Prometheus labels.

All base classes accept the Prometheus client as an optional constructor argument. Passing `undefined` (or omitting it) disables the metric: no Prometheus registration happens and `registerMeasurement` becomes a no-op. This lets consumers gate metrics behind a runtime flag without conditionally instantiating their classes.

Table of contents:
1. [AbstractLabeledCounterMetric](#abstractlabeledcountermetric)
2. [AbstractMultiLabeledCounterMetric](#abstractmultilabeledcountermetric)
3. [AbstractLabeledHistogramMetric](#abstractlabeledhistogrammetric)
4. [AbstractDimensionalCounterMetric](#abstractdimensionalcountermetric)
5. [AbstractDimensionalHistogramMetric](#abstractdimensionalhistogrammetric)

### AbstractLabeledCounterMetric

A base class for counter metrics that have **exactly one label whose possible values are known at construction time**.

**When to use**: you want a counter with a single label (e.g. `status`) and you can enumerate all its possible values upfront. The class pre-initializes every declared value to `0`, so the corresponding time series exist from the moment the metric is registered — even before any measurement is recorded. This is useful for dashboards that should never display "no data".

**When NOT to use**: if you need more than one label, or if the label values are only known at runtime, use [`AbstractMultiLabeledCounterMetric`](#abstractmultilabeledcountermetric) instead.

Usage:

```typescript
export class PizzaDeliveryCountMetric extends AbstractLabeledCounterMetric<
	'status',
	['delivered_to_customer', 'delivered_to_pickup_point', 'not_delivered']
> {
	constructor({ promClient }: Deps) {
		super(
			{
				name: 'pizza_delivery_count',
				helpDescription: 'Number of pizza deliveries per status',
				label: 'status',
				measurementKeys: ['delivered_to_customer', 'delivered_to_pickup_point', 'not_delivered'],
			},
            promClient,
		)
	}
}

const pizzaDeliveryCountMetric = new PizzaDeliveryCountMetric({ appMetrics })

pizzaDeliveryCountMetric.registerMeasurement({
    'delivered_to_customer': 1,
    'delivered_to_pickup_point': 2,
})
```

Where:
1. `name` - metric name
2. `helpDescription` - metric description
3. `label` - metric label name (single label)
4. `measurementKeys` - the complete set of possible values for that label

Creation of `PizzaDeliveryCountMetric` initializes a `pizza_delivery_count` metric with `status` label and all the provided measurement keys
(`delivered_to_customer`, `delivered_to_pickup_point`, `not_delivered`) as 0 values.

`registerMeasurement` allows you to set the specific measurement values of the metric.

### AbstractMultiLabeledCounterMetric

A base class for counter metrics that have **one or more labels whose values are not necessarily known at construction time**.

**When to use**: you need multiple labels on a counter, or the label values only become available at runtime and can't be enumerated in advance. Unlike `AbstractLabeledCounterMetric`, this class does **not** pre-initialize any time series — each series appears in Prometheus the first time `registerMeasurement` is called with that specific label combination.

**When NOT to use**: if you have exactly one label with a fully known, enumerable set of values and want the series to exist from the start (with `0` values until measured), use [`AbstractLabeledCounterMetric`](#abstractlabeledcountermetric) instead.

Usage:

```typescript
export class HttpRequestCountMetric extends AbstractMultiLabeledCounterMetric<
	['method', 'route', 'status_code']
> {
	constructor({ promClient }: Deps) {
		super(
			{
				name: 'http_request_count',
				helpDescription: 'Number of HTTP requests by method, route and status code',
				labelNames: ['method', 'route', 'status_code'],
			},
			promClient,
		)
	}
}

const httpRequestCountMetric = new HttpRequestCountMetric({ appMetrics })

httpRequestCountMetric.registerMeasurement({
    method: 'GET',
    route: '/api/users',
    status_code: '200',
    increment: 1,
})
```

Where:
1. `name` - metric name
2. `helpDescription` - metric description
3. `labelNames` - the list of label names the counter will carry

The measurement object contains a value for each label plus a mandatory `increment` indicating how much to add to the counter for that combination.

**Key differences with `AbstractLabeledCounterMetric`**:

| Aspect                     | `AbstractLabeledCounterMetric`     | `AbstractMultiLabeledCounterMetric` |
|----------------------------|------------------------------------|-------------------------------------|
| Number of labels           | Exactly one                        | One or more                         |
| Label values at construction | Must be enumerated (`measurementKeys`) | Not declared; discovered at runtime |
| Pre-initialization to `0`  | Yes, for every declared value      | No, series appear on first measurement |
| Measurement shape          | `{ [labelValue]: incrementAmount }` | `{ [labelName]: labelValue, ..., increment: number }` |

### AbstractLabeledHistogramMetric

A base class for histogram-like metrics, supporting configurable buckets and labeled observations. It handles metric registration and measurement recording, accepting either a direct `time` value or a `startTime`/`endTime` pair.

Usage:

```typescript
export class RequestDurationMetric extends AbstractLabeledHistogramMetric<['route']> {
  constructor({ promClient }: Deps) {
    super(
      {
        name: 'request_duration_seconds',
        helpDescription: 'Duration of requests in seconds',
        labelNames: ['route'],
        buckets: [0.1, 0.5, 1, 5],
      }, 
      promClient,
    )
  }
}

const requestDurationMetric = new RequestDurationMetric({ appMetrics })

// Record a duration directly:
requestDurationMetric.registerMeasurement({ route: '/api/users', time: 0.32 })

// Or record using start and end times (in seconds):
const start = Date.now() / 1000
// ... operation ...
const end = Date.now() / 1000
requestDurationMetric.registerMeasurement({ route: '/api/users', startTime: start, endTime: end })
```

### AbstractDimensionalCounterMetric

A base class for counter metrics where each dimension is registered as a separate label-free Prometheus Counter. The metric name for each dimension is produced by a caller-provided `buildMetricName(dimension)` callback, giving you full control over the naming scheme.

Use this instead of `AbstractLabeledCounterMetric` when the tool consuming your metrics does not support Prometheus labels.

Usage:

```typescript
export class PizzaDeliveryCountMetric extends AbstractDimensionalCounterMetric<
	['delivered_to_customer', 'delivered_to_pickup_point', 'not_delivered']
> {
	constructor({ promClient }: Deps) {
		super(
			{
				helpDescription: 'Number of pizza deliveries per status',
				dimensions: ['delivered_to_customer', 'delivered_to_pickup_point', 'not_delivered'],
				buildMetricName: (dimension) => `pizza_delivery_${dimension}:counter`,
			},
			promClient,
		)
	}
}

const pizzaDeliveryCountMetric = new PizzaDeliveryCountMetric({ appMetrics })

pizzaDeliveryCountMetric.registerMeasurement({
    delivered_to_customer: 1,
    delivered_to_pickup_point: 2,
})
```

Where:
1. `helpDescription` - metric description
2. `dimensions` - the set of possible dimension values
3. `buildMetricName` - function that returns the Prometheus metric name for a given dimension

Construction registers a separate label-free Prometheus Counter for each dimension. All dimensions are initialized to `0` on construction.

The above example registers the following metrics:
```text
pizza_delivery_delivered_to_customer:counter 0
pizza_delivery_delivered_to_pickup_point:counter 0
pizza_delivery_not_delivered:counter 0
```

`registerMeasurement` increments only the dimensions provided.

### AbstractDimensionalHistogramMetric

A base class for histogram metrics where each dimension is registered as a separate label-free Prometheus Histogram. The metric name for each dimension is produced by a caller-provided `buildMetricName(dimension)` callback, giving you full control over the naming scheme.

Use this instead of `AbstractLabeledHistogramMetric` when the tool consuming your metrics does not support Prometheus labels.

Usage:

```typescript
export class RequestDurationMetric extends AbstractDimensionalHistogramMetric<['successful', 'failed']> {
  constructor({ promClient }: Deps) {
    super(
      {
        helpDescription: 'Duration of requests in seconds',
        dimensions: ['successful', 'failed'],
        buckets: [0.1, 0.5, 1, 5],
        buildMetricName: (dimension) => `request_duration_${dimension}:histogram`,
      },
      promClient,
    )
  }
}

const requestDurationMetric = new RequestDurationMetric({ appMetrics })

// Record a duration directly:
requestDurationMetric.registerMeasurement({ dimension: 'successful', time: 0.32 })

// Or record using start and end times (in seconds):
const start = Date.now() / 1000
// ... operation ...
const end = Date.now() / 1000
requestDurationMetric.registerMeasurement({ dimension: 'failed', startTime: start, endTime: end })
```

Where:
1. `helpDescription` - metric description
2. `dimensions` - the set of possible dimension values
3. `buckets` - histogram bucket boundaries
4. `buildMetricName` - function that returns the Prometheus metric name for a given dimension

The above example registers the following metrics:
```text
request_duration_successful:histogram
request_duration_failed:histogram
```

`registerMeasurement` takes a single object containing the target `dimension` and either a direct `time` value or a `startTime`/`endTime` pair.
