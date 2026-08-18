# Principles

Design principles for `@lokalise/api-contracts`. This is an internal document for people
writing or reviewing code in this package; consumer-facing usage documentation belongs in
the README.

## Shared, functionally relevant concepts get dedicated named fields — `metadata` is for app-specific semantics

When adding a concept to the contract model, choose where it lives by who needs to
understand it:

- **Predefined, functionally relevant fields that are not app-specific are first-class named
  fields.** If shared packages (`@lokalise/fastify-api-contracts`, `opinionated-machine`,
  http clients, OpenAPI generators, gateways) need to read the value and act on it, it must
  be a dedicated, typed field on the model.
- **`metadata` is reserved for service-specific semantics.** It is intentionally typed as an
  open record (`Record<string, unknown>`) that each service specializes via module
  augmentation (e.g. a service adding its own role-based access fields). Shared packages
  must not depend on any particular `metadata` key.

### Why

1. **Nothing can rely on `metadata` generically.** It has no shared key or type that shared
   packages could depend on. If a cross-cutting concept lived there, every service would have
   to declare its own augmentation and wire its own handling (e.g. a custom swagger transform
   reading its own metadata shape) — exactly the per-service duplication these libraries exist
   to remove. A first-class field is handled once, in the shared packages, and a service
   adopts it by writing one property on a contract.
2. **Functionally relevant fields are model semantics, not annotations.** A field like
   `visibility` states who a route is intended for — a property of the contract itself.


### Rule of thumb

Ask: *could a shared package meaningfully act on this value for every service?*

- Yes → dedicated named field, typed in the shared model, with a builder-stamped default when
  the field should always be present on built values.
- No (its meaning depends on one app's domain) → `metadata`, specialized by that app via
  module augmentation.
