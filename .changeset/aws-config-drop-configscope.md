---
"@lokalise/aws-config": major
---

Remove the ConfigScope-based `getAwsConfig()` (use `getEnvaseAwsConfig()` instead) and require `envase` >=2.0.0 as a peer dependency. `AWS_CONFIG_ENV_VARS` and the `AwsConfig` type are unchanged.
