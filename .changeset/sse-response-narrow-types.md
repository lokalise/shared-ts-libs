---
"@lokalise/api-contracts": patch
---

Fix `sseResponse()` and `blobResponse()` losing type narrowing: both were annotated to return the wide `BodyContentResponseEntry`, so contracts using them inferred every response mode (json/sse/blob) and `InferSseSuccessResponses` widened event schemas to `Record<string, z.ZodType>`. They now infer narrow entry types — `sseResponse()` preserves the concrete event-schema map and `blobResponse()` preserves the literal media-type key — narrowing exactly like an inline `content` map with `sseBody()` / `blobBody()`.