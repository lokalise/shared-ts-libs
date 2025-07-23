# Metrics Utils

This package contains set of utilities to work with Prometheus metrics.

Table of contents:
1. [AbstractCounterMetric](#AbstractCounterMetric)
2. [AbstractHistogramMetric](#AbstractHistogramMetric)

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

// Or record using start and end times:
const start = Date.now()
// ... operation ...
const end = Date.now()
requestDurationMetric.registerMeasurement({ route: '/api/users', startTime: start, endTime: end })
```
