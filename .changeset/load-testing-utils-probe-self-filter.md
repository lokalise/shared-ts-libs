---
"@lokalise/load-testing-utils": patch
---

The Postgres probe now leaves its own queries out of the `pg_stat_statements` figures. The marker sat in front of each query, where the view never keeps it, so the probe counted itself. Its extension check and `pg_stat_database` read are now one query, so its calls no longer add to the marker-free entries an earlier version left behind.
