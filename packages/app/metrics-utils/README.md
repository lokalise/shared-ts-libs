# Metrics Utils

This package contains set of utilities to work with Prometheus metrics.

Table of contents:
1. [AbstractCounterMetric](#AbstractCounterMetric)

### AbstractCounterMetric

A base class for single counter-like metrics.
In comparison to using raw prometheus client directly, it takes care of metric initialization and provides a convenient way to set metric values.

Usage:

```typescript
export class PizzaDeliveryCountMetric extends AbstractCounterMetric<
	'status',
	['delivered_to_customer', 'delivered_to_pickup_point', 'not_delivered']
> {
	constructor({ appMetrics }: Deps) {
		super(
			{
				name: 'pizza_delivery_count',
				helpDescription: 'Number of pizza deliveries per status',
				label: 'status',
				measurementKeys: ['delivered_to_customer', 'delivered_to_pickup_point', 'not_delivered'],
			},
			appMetrics,
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
