---
"@lokalise/metrics-utils": minor
---

Add gauge metric support: `AbstractLabeledGaugeMetric` (single known label, pre-initialized to 0), `AbstractMultiLabeledGaugeMetric` (one or more labels, including the two-label case, discovered at runtime), and `AbstractDimensionalGaugeMetric` (one label-free metric per dimension, with eager/lazy registration). Each measurement sets the current gauge value.
