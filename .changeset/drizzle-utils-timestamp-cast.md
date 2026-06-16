---
"@lokalise/drizzle-utils": patch
---

Fix drizzleFullBulkUpdate rejecting Date values: timestamp/date/time columns now serialize Date to an ISO-8601 string before the explicit VALUES cast, in both `where` and `data` columns.
