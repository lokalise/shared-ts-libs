---
"@lokalise/load-testing-utils": major
---

Report what a run cost each statement, and event loop lag while the load is on.

- Breaking: `ResourceDelta.eventLoopLagP99SecondsAtEnd` is replaced by `eventLoopLag` (`intervals`, `p99WorstSeconds`, `p99MedianSeconds`, `maxSeconds`), and the report's "Event loop lag p99 at end" row by worst interval, median interval, max and interval count. `measureResources` takes `{ sampleMetrics, sampleIntervalMs }` to scrape the metrics during the run; `scrapeMetrics(url)` is the usual sampler.
- Breaking: `ResourceDelta.topStatements` is the per-statement difference between the two scrapes instead of the closing scrape's cumulative ranking. It needs the probe read with `?statements=all` at both ends, which adds `allStatements` to each engine; without it an engine gets a warning instead of a table. `diffStatements` and `summarizeEventLoopLag` are exported.
- `readCockroachStats` reads `crdb_internal.statement_statistics`, which includes flushed statistics, instead of `node_statement_statistics`, which the node clears every `sql.stats.flush.interval`.
- A `?statements=all` list cut at `maxStatements` carries `allStatementsTruncated`, and the report leaves out statements missing from such an opening list. `scrapeResources` waits up to 30 s for the probe. `measureResources` rejects a `sampleIntervalMs` that is not a positive number.
- Postgres statements hidden from the probe's role (no `queryid`) are left out of the statements table, with a `reason` saying how many.
- Statements carry a `key` (Postgres `queryid`, CockroachDB fingerprint) and are grouped by it.
