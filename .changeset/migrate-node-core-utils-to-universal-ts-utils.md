---
"@lokalise/auth": patch
"@lokalise/backend-http-client": patch
"@lokalise/background-jobs-common": patch
"@lokalise/context-fastify-plugins": patch
"@lokalise/fastify-bullboard-plugin": patch
"@lokalise/healthcheck-utils": patch
"@lokalise/prisma-utils": patch
---

Import `Either`, `DefiniteEither`, `FreeformRecord`, `MayOmit`, `isError`, `isObject`, `deepClone`, `removeNullish` and `copyWithoutUndefined` from `@lokalise/universal-ts-utils/node` instead of their deprecated `@lokalise/node-core` re-exports.
