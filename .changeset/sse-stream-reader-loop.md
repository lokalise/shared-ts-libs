---
"@lokalise/frontend-http-client": patch
---

Fix SSE responses from `sendByApiContract` failing in some browsers by reading the event stream with a manual reader loop instead of `ReadableStream` async iteration.
