---
'@lokalise/background-jobs-common': patch
---

Detect duplicate processors by the resolved BullMQ queue name instead of the raw queue id, so that two processors whose ids differ only in how dashboard grouping is spelled out no longer both consume the same queue.
