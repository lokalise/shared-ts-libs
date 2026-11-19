# @lokalise/auth

## 2.0.3

### Patch Changes

- dc1ef25: Import `Either`, `DefiniteEither`, `FreeformRecord`, `MayOmit`, `isError`, `isObject`, `deepClone`, `removeNullish` and `copyWithoutUndefined` from `@lokalise/universal-ts-utils/node` instead of their deprecated `@lokalise/node-core` re-exports.

## 2.0.2

### Patch Changes

- 8dd9714: Fix JwksTokenDecoder bypassing the jwks-rsa cache for tokens with an empty-string `kid`.
