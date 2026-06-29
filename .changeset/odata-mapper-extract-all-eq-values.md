---
"@lokalise/odata-mapper": patch
---

Fix `extractFieldValues` dropping all but the first value when a field is filtered by multiple `eq` clauses joined by `or` (e.g. `path eq 'a' or path eq 'b'` now returns `['a', 'b']` instead of `['a']`). Adds a new `extractEqualityValues` helper that collects every equality value for a field; `extractEqualityValue` (singular) is unchanged.
