---
'@lokalise/config': patch
---

Require `envase` 2.1.0 or later as a peer dependency. The type declarations reference `EnvvarEntry`, which `envase` exports only from 2.1.0, so on 2.0.0 the parsed config fields were silently typed as `any`.
