---
'@lokalise/opentelemetry-fastify-bootstrap': minor
---

Added optional `peerDbNames` option to `initOpenTelemetry` (e.g. `peerDbNames: { elasticsearch: 'lokalise' }`). When configured, a span processor stamps the OTel-canonical `db.namespace` on outbound DB spans based on `db.system`, plus mirrors `peer.db.system` from `db.system` when missing. This joins those spans to Datadog's existing inferred-service entity for the cluster — useful for the Node.js `@elastic/transport` v8 client, which sets `db.system: elasticsearch` but never `db.namespace`, leaving outbound ES calls in Datadog's synthetic `blocked-ip-address` bucket. `PeerDbNameSpanProcessor` is exported for direct use as a custom processor.
