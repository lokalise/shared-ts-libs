# Script utils

# Usage

## Syncing vault secrets with .env file

```typescript
//sync-with-vault.ts
import { synchronizeEnvFileWithVault } from '@lokalise/script-utils'

//Use this function to sync .env file with vault secrets, provide all params to the function.
```

Later in `package.json`, `tsx` is recommended to be used as a script runner, so you can add the following script to your `package.json` file:
```
"scripts": {
    "sync-with-vault": "tsx sync-with-vault.ts"
}
```
