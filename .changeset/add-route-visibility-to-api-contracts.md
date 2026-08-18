---
"@lokalise/api-contracts": minor
---

Add route `visibility` ('public' | 'internal') to API contracts, and tighten contract types so every built contract carries its parsing/documentation fields.

- New `visibility` field on all contract types (REST, SSE, dual-mode, and the new `ApiContract` system). Optional in every builder input; every builder stamps it, defaulting to `'public'`. `'internal'` marks routes (e.g. backend-for-frontend endpoints) that OpenAPI generators should exclude from the generated document; it has no runtime effect. Exported `RouteVisibility` type.
- `isEmptyResponseExpected` and `isNonJSONResponseExpected` are now required on built REST contract types (builders always stamped their defaults at runtime; the types now reflect it). They remain optional in builder inputs via `MayOmit`.
- Dual-mode contracts now declare the flags too: `isEmptyResponseExpected` is configurable (default `false`), enabling dual-mode routes whose sync branch responds 204/no-body; `isNonJSONResponseExpected` is always `false` (the sync response is JSON by construction). This also preserves dual-mode → REST structural assignability. Pure SSE contracts carry `visibility` but no flags (they do not apply to event streams).
- `defineApiContract` now returns a shallow copy with `visibility` stamped instead of returning the input object by reference.

Note for consumers not using the builders: contract object literals hand-typed as `GetRouteDefinition` / `SSEContractDefinition` / etc. must now include the required fields (`visibility`, and the two flags on REST/dual-mode shapes). Contracts built via any builder need no changes.
