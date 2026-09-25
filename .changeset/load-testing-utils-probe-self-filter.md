---
"@lokalise/load-testing-utils": patch
---

The Postgres probe now leaves its own queries out of the `pg_stat_statements` figures. The marker sat in front of each query, where the view never keeps it, so the probe counted itself. The statements table also leaves out `<insufficient privilege>` rows, which carry no statement text; the totals still count them.
