# context-fastify-plugins

This library exposes several fastify plugins that rely on @fastify/request-context (ALS) to work.

> **This package owns the OpenTelemetry SDK versions.** It pins the `@opentelemetry/*` SDK packages as exact `dependencies` so every service tracks a single validated set. Services should not declare their own direct `@opentelemetry/*` SDK dependencies — a different resolved version installs a second copy, and objects passed across the boundary (span processors, samplers, exporters) then fail cross-copy `instanceof` checks. If you need a direct OTel SDK dep, align it to the exact version pinned here (or pin it via a package-manager `override`).
