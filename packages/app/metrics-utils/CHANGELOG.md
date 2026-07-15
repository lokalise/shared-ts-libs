# @lokalise/metrics-utils

## 6.2.0

### Minor Changes

- f985722: Add gauge metric support: `AbstractLabeledGaugeMetric` (single known label, pre-initialized to 0), `AbstractMultiLabeledGaugeMetric` (one or more labels, including the two-label case, discovered at runtime), and `AbstractDimensionalGaugeMetric` (one label-free metric per dimension, with eager/lazy registration). Each measurement sets the current gauge value.

## 6.1.0

### Minor Changes

- 1293816: Adding Prometheus-based transaction observability managers so we can use them to record metrics across all packages that use transaction managers.
