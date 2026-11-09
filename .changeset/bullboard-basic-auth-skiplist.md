---
"@lokalise/fastify-bullboard-plugin": minor
---

`basicAuth` accepts a `skipList` as an alternative to `enableList`: every route requires credentials except the listed route paths, which are matched exactly. Pass one of the two; passing both or neither fails at registration.
