---
"@lokalise/load-testing-utils": minor
---

`formatResourcesSection(delta, run)` takes the run's totals and adds "CPU, share of one core" and "CPU per request" rows. `readRunTotals(summary)` and `readRunTotalsFile(path, { writtenSince })` read those totals from a k6 summary, and `measureResources` now also returns `startedAt` to pass as `writtenSince`.
