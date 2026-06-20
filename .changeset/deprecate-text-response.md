---
"@lokalise/api-contracts": minor
---

Deprecate `textResponse` in favour of `blobResponse`. Both carry the same protocol fact (the response `content-type`) and differ only in the JS type the client materializes (`string` vs `Blob`) — a consumer decode preference that the shared contract should not force. `blobResponse` defers that choice to the call site via `.text()` / `.arrayBuffer()` / `.stream()`. `textResponse` continues to work and will be removed in a future major release.
