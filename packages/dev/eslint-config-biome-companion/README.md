# eslint-config-biome-companion

This package is an addition to our [biome-config](https://github.com/lokalise/shared-ts-libs/tree/main/packages/dev/biome-config) setup.

Currently, the configuration is a copy-paste. In the future, it may become a standalone package.

### Install dependencies

We are still using ESLint version 8. The packages that we rely on do not yet provide configurations compatible with version 9.

```sh
npm install --save-dev eslint@8 @typescript-eslint/parser eslint-plugin-testing-library eslint-plugin-i18next @tanstack/eslint-plugin-query
```

### Create eslint config

Create a new `.eslintrc.json` file within your repository with the following content:

```jsonc
{
  "ignorePatterns": ["dist", "node_modules", "playwright-report", "test-results", "coverage"],
  "parser": "@typescript-eslint/parser",
  "parserOptions": {
    "project": "./tsconfig.lint.json", // <- Update with path to your own TS config file
    "ecmaVersion": 2023,
    "sourceType": "module"
  },
  "overrides": [
    {
      // React Query setup
      // https://tanstack.com/query/v4/docs/eslint/eslint-plugin-query
      "extends": ["plugin:@tanstack/eslint-plugin-query/recommended"],
      "files": ["*.ts", "*.tsx"]
    },
    {
      // i18next Setup
      // https://github.com/edvardchen/eslint-plugin-i18next
      "extends": ["plugin:i18next/recommended"],
      "files": ["*.ts", "*.tsx"],
      // We can ignore this in test files
      "excludedFiles": ["*.test.tsx", "*.test.ts"]
    },
    {
      // Testing Library setup
      // https://github.com/testing-library/eslint-plugin-testing-library
      "files": ["*.test.tsx"],
      "extends": ["plugin:testing-library/react"]
    }
  ]
}

```
