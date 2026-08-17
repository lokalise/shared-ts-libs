# @lokalise/context-fastify-plugins

## 3.0.0

### Major Changes

- b332c1d: Pin OpenTelemetry dependency versions so all services track a single validated set instead of resolving their own.

  - `opentelemetry-fastify-bootstrap`: move the OpenTelemetry SDK packages from `peerDependencies` to pinned `dependencies`. `fastify` and `@opentelemetry/api` stay peers — `api` is a process-wide singleton, so it's kept as a peer (`>=1.9.0 <1.10.0`) to avoid duplicate copies when a host already provides one (e.g. via `dd-trace`).
  - `context-fastify-plugins`: align the OpenTelemetry versions with the bootstrap release train (experimental packages 0.221.0, stable packages 2.10.0, `@opentelemetry/semantic-conventions` 1.43.0). `@opentelemetry/api` is no longer a direct dependency (it was never imported directly; the SDK packages bring it).

  **Migration:** these packages now own the OpenTelemetry SDK versions. Services should drop their own direct `@opentelemetry/*` SDK dependencies and let these packages own them. Because the SDK packages are pinned to exact versions, a service keeping its own (differently resolved) direct SDK dep will get a second copy, and objects passed across that boundary (span processors, samplers, exporters) can fail cross-copy `instanceof` checks. If a direct OTel SDK dep is unavoidable, align it to the exact versions pinned here or enforce it via a package-manager `override`. `@opentelemetry/api` stays a shared peer/singleton.
