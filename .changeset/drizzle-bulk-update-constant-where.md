---
"@lokalise/drizzle-utils": patch
---

`drizzleFullBulkUpdate` emits a `where` column whose value is the same string, number, boolean or bigint on every entry as a constant predicate (`tbl."col" = $n::type`) instead of a `VALUES` column. On CockroachDB this stops a tenant column such as `project_id` from steering the planner into a lookup join that reads every row of the tenant. Results are unchanged; the generated statement differs for every caller that passes such a column.
