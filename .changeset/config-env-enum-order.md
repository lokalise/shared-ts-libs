---
'@lokalise/config': patch
---

List `NODE_ENV` values as `production`, `test`, `development` and `APP_ENV` values as `production`, `staging`, `development`, ordered by how close each is to production, as node-service-template does. Accepted values and inferred types are unchanged; only the order in generated env var docs changes.
