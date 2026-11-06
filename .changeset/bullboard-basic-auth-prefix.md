---
"@lokalise/fastify-bullboard-plugin": patch
---

Fix `basicAuth` leaving BullBoard's routes unauthenticated. An `enableList` entry now protects that path and every route under it, so `'/bull'` covers `/bull/`, `/bull/api/queues/...` (including the job retry, clean and obliterate endpoints) and `/bull/static/*`. Before, only the exact path was guarded, so only the bare `/bull` page asked for credentials. Routes that only share the string prefix, like `/bullet`, are still unprotected, and the root path `'/'` is still matched exactly.
