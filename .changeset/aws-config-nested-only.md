---
"@lokalise/aws-config": major
---

`getEnvaseAwsConfig()` fragments must now be nested under a key in `createConfig()` (`aws` by default, or the `path` option); spreading them at the root level is no longer supported. `EnvaseAwsConfigComputedType` now takes the nesting key as its type parameter instead of the raw config shape.
