---
"@lokalise/fastify-bullboard-plugin": minor
---

`basicAuth` now protects every route under an `enableList` path, not just the exact path, so `'/bull'` also guards BullBoard's API and job-mutation routes, which were served without credentials.
