---
"@lokalise/frontend-http-client": minor
---

Add `createFallbackTransport`, the HTTP adapter for `@opinionated-machine/sse-fallback`'s SSE-with-polling-fallback client: `fetchSnapshot` requests a contract's JSON branch and validates the snapshot against its schema, `openStream` requests the SSE branch, forwards `Last-Event-ID` on reconnect and yields raw text chunks so the core's byte-level liveness watchdog keeps working. Refusals resolve with their status so `unretryableStatuses` and `onAuthChallenge` can act on them, the header source is resolved fresh per request so a refreshed token reaches the retry, and SSE payloads are validated against the contract's event schemas (`eventValidation: 'report' | 'drop' | 'off'`). Ships with `buildFallbackParams` for contract-typed subscription params, `SseFramer`, and the `FallbackSnapshotOf` / `FallbackEventsOf` contract inference helpers. No new dependency: the transport seam is matched structurally.
