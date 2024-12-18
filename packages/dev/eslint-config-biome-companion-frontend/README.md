# eslint-config-biome-companion-frontend

This package is an addition to our [biome-config](https://github.com/lokalise/shared-ts-libs/tree/main/packages/dev/biome-config) setup. It enables enforcement of coding practices not covered by Biome, providing an additional layer of consistency and quality for frontend development.

Currently, the configuration is a copy-paste. In the future, it may become a standalone package.

### Install dependencies

We are still using ESLint version 8. The packages that we rely on do not yet provide configurations compatible with
version 9.

```sh
npm install --save-dev eslint@8 @typescript-eslint/parser eslint-plugin-testing-library eslint-plugin-i18next @tanstack/eslint-plugin-query eslint-plugin-react-compiler
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
    },
    {
      // React Compiler setup
      // https://github.com/facebook/react/tree/main/compiler/packages/eslint-plugin-react-compiler
      "files": ["*.ts", "*.tsx"],
      "plugins": ["react-compiler"],
      "rules": {
        "react-compiler/react-compiler": "error"
      }
    }
  ]
}

```

### Add npm run command

Add following command to the `package.json`.

```jsonc
{
  "scripts": {
    "lint": "eslint --cache --max-warnings=0 ."
  }
}
```

