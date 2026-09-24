---
"@lokalise/load-testing-utils": minor
---

`formatResourcesSection(delta, run)` takes the run's totals and adds "CPU, share of one core" and "CPU per request" rows, or takes `{ reason }` and prints a warning line saying why they are missing. `readRunTotals(summary)` and `readRunTotalsFile(path)` read the totals, or that reason, from a k6 summary. A summary without HTTP requests still gives the share of a core.
