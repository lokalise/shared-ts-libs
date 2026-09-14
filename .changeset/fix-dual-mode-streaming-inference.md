---
"@lokalise/api-contracts": patch
---

Fix `streaming` inference in `ClientRequestParams` for dual-mode (JSON + SSE) contracts. The `streaming` member was wrapped in `Prettify` together with the rest of the params, which blocked TypeScript from inferring `TIsStreaming` from a call site, so `sendByApiContract(client, dualContract, { streaming: true })` was rejected and the result type never narrowed to the SSE body.
