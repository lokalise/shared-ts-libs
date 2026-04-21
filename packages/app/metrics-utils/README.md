# Metrics Utils

This package contains set of utilities to work with Prometheus metrics.

Table of contents:
1. [AbstractCounterMetric](#AbstractCounterMetric)
2. [AbstractHistogramMetric](#AbstractHistogramMetric)
3. [AbstractDimensionalCounterMetric](#AbstractDimensionalCounterMetric)
4. [AbstractDimensionalHistogramMetric](#AbstractDimensionalHistogramMetric)

### AbstractCounterMetric

A base class for single counter-like metrics.
In comparison to using raw prometheus client directly, it takes care of metric initialization and provides a convenient way to set metric values.

Usage:

```typescript
export class PizzaDeliveryCountMetric extends AbstractCounterMetric<
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
3. `label` - metric label name
4. `measurementKeys` - metric label values

Creation of `PizzaDeliveryCountMetric` object initializes a `pizza_delivery_count` metric with `status` label and all the provided measurement keys
(`delivered_to_customer`, `delivered_to_pickup_point`, `not_delivered`) as 0 values.

`registerMeasurement` method allows to set the specific measurement values of the metric.

### AbstractHistogramMetric

A base class for histogram-like metrics, supporting configurable buckets and labeled observations. It handles metric registration and measurement recording, accepting either a direct `time` value or a `startTime`/`endTime` pair.

Usage:

```typescript
export class RequestDurationMetric extends AbstractHistogramMetric<['route']> {
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

A base class for counter metrics where dimensions are encoded in the metric name rather than as Prometheus labels. Each dimension becomes a separate metric record in the format `{namePrefix}_{dimension}:{nameSuffix}`.

Use this instead of `AbstractCounterMetric` when the tool consuming your metrics does not support Prometheus labels.

Usage:

```typescript
export class PizzaDeliveryCountMetric extends AbstractDimensionalCounterMetric<
	['delivered_to_customer', 'delivered_to_pickup_point', 'not_delivered']
> {
	constructor({ promClient }: Deps) {
		super(
			{
				namePrefix: 'pizza_delivery',
				nameSuffix: 'counter',
				helpDescription: 'Number of pizza deliveries per status',
				dimensions: ['delivered_to_customer', 'delivered_to_pickup_point', 'not_delivered'],
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
1. `namePrefix` - prefix of the metric name, before the dimension (e.g. `pizza_delivery`)
2. `nameSuffix` - suffix of the metric name, after the dimension (e.g. `counter`)
3. `helpDescription` - metric description
4. `dimensions` - the set of possible dimension values

Construction registers a separate label-free Prometheus Counter for each dimension, named `{namePrefix}_{dimension}:{nameSuffix}`. All dimensions are initialized to `0` on construction.

The above example registers the following metrics:
```text
pizza_delivery_delivered_to_customer:counter 0
pizza_delivery_delivered_to_pickup_point:counter 0
pizza_delivery_not_delivered:counter 0
```

`registerMeasurement` increments only the dimensions provided.

### AbstractDimensionalHistogramMetric

A base class for histogram metrics where dimensions are encoded in the metric name rather than as Prometheus labels. Each dimension becomes a separate label-free Prometheus Histogram in the format `{namePrefix}_{dimension}:{nameSuffix}`.

Use this instead of `AbstractHistogramMetric` when the tool consuming your metrics does not support Prometheus labels.

Usage:

```typescript
export class RequestDurationMetric extends AbstractDimensionalHistogramMetric<['successful', 'failed']> {
  constructor({ promClient }: Deps) {
    super(
      {
        namePrefix: 'request_duration',
        nameSuffix: 'histogram',
        helpDescription: 'Duration of requests in seconds',
        dimensions: ['successful', 'failed'],
        buckets: [0.1, 0.5, 1, 5],
      },
      promClient,
    )
  }
}

const requestDurationMetric = new RequestDurationMetric({ appMetrics })

// Record a duration directly:
requestDurationMetric.registerMeasurement('successful', { time: 0.32 })

// Or record using start and end times (in seconds):
const start = Date.now() / 1000
// ... operation ...
const end = Date.now() / 1000
requestDurationMetric.registerMeasurement('failed', { startTime: start, endTime: end })
```

Where:
1. `namePrefix` - prefix of the metric name, before the dimension (e.g. `request_duration`)
2. `nameSuffix` - suffix of the metric name, after the dimension (e.g. `histogram`)
3. `helpDescription` - metric description
4. `dimensions` - the set of possible dimension values
5. `buckets` - histogram bucket boundaries

The above example registers the following metrics:
```text
request_duration_successful:histogram
request_duration_failed:histogram
```

`registerMeasurement` takes the dimension as its first argument and either a direct `time` value or a `startTime`/`endTime` pair.
