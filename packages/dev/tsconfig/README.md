# @lokalise/tsconfig

Shared TypeScript configuration for Lokalise projects.

## Getting Started

### Requirements:
- TypeScript `>=5.9.0`
- ESM codebase

### Installation:
```bash
npm install --save-dev @lokalise/tsconfig
```

TypeScript configuration depends on whether you're using a `bundler` (Vite, esbuild, SWC, etc.) or `tsc` to build your code:
- `Bundlers` are commonly used for frontend applications, where they also bundle and optimize code for faster loading.
- `tsc` is typically used for backend applications and libraries, where you directly compile TypeScript into JavaScript.

## **Using a Bundler**

Create a `tsconfig.json` that whitelists the files for type-checking:
```json
{
  "extends": "@lokalise/tsconfig/bundler",
  "include": ["src/**/*", "test/**/*", "vitest.config.ts"]
}
```

For frontend applications running in the DOM:
```json
{
  "extends": "@lokalise/tsconfig/bundler-dom",
  "include": ["src/**/*", "test/**/*", "vitest.config.ts"]
}
```

## **Using `tsc` (TypeScript Compiler)**

Create a `tsconfig.json` that whitelists the files for type-checking:
```json
{
  "extends": "@lokalise/tsconfig/tsc",
  "include": ["src/**/*", "test/**/*", "vitest.config.ts"]
}
```

For frontend applications running in the DOM:
```json
{
  "extends": "@lokalise/tsconfig/tsc-dom",
  "include": ["src/**/*", "test/**/*", "vitest.config.ts"]
}
```

Create a `tsconfig.build.json` for building the code, ensuring that only
the necessary files are included, and unnecessary ones are excluded.

For building an application or a service:
```json
{
  "extends": ["./tsconfig.json", "@lokalise/tsconfig/build-app"],
  "include": ["src/**/*"],
  "exclude": ["src/**/*.test.ts"]
}
```

For building a publishable library:
```json
{
  "extends": ["./tsconfig.json", "@lokalise/tsconfig/build-public-lib"],
  "include": ["src/**/*"],
  "exclude": ["src/**/*.test.ts"]
}
```

For building a private monorepo library:
```json
{
  "extends": ["./tsconfig.json", "@lokalise/tsconfig/build-private-lib"],
  "include": ["src/**/*"],
  "exclude": ["src/**/*.test.ts"]
}
```

## **Additional Configuration Options**

### **JSX Support**

If your app uses JSX, add `jsx` option in `tsconfig.json`:
```json
{
  "extends": "@lokalise/tsconfig/bundler-dom",
  "compilerOptions": {
    "jsx": "react-jsx"
  }
}
```

### **Adding Global Types**

To include additional type definitions, add `types` option in `tsconfig.json`:
```json
{
  "extends": "@lokalise/tsconfig/tsc",
  "compilerOptions": {
    "types": ["vitest/globals"]
  }
}
```

## **Options That Can Be Disabled To Ease Adoption**

### [erasableSyntaxOnly](https://www.typescriptlang.org/tsconfig/#erasableSyntaxOnly)

It marks the following syntax as errors:
- `enum` declarations
- `namespace` and `module` with runtime code
- Parameter properties in classes
- Non-ECMAScript `import =` and `export =` assignments

To disable:
```json
{
  "extends": "@lokalise/tsconfig/tsc",
  "compilerOptions": {
    "erasableSyntaxOnly": false
  }
}
```

### [noUncheckedIndexedAccess](https://www.typescriptlang.org/tsconfig/#noUncheckedIndexedAccess)

It ensures that accessing arrays or objects without checking if a value exists
results in a TypeScript error, preventing potential runtime crashes.

**Example for accessing the array:**
```typescript
const arr: string[] = [];

console.log(arr[0].trim());
```
- With `"noUncheckedIndexedAccess": true` → TypeScript error: "Object is possibly `undefined`"
- With `"noUncheckedIndexedAccess": false` → No error, but at runtime, this will throw:
`"TypeError: Cannot read properties of undefined (reading 'trim')"`

**Example for accessing the object:**
```typescript
const obj: Record<string, string> = {};

console.log(obj.some.trim());
```
- With `"noUncheckedIndexedAccess": true` → TypeScript error: "`obj.some` is possibly `undefined`"
- With `"noUncheckedIndexedAccess": false` → No error, but at runtime, this will throw:
`"TypeError: Cannot read properties of undefined (reading 'trim')"`

To disable:
```json
{
  "extends": "@lokalise/tsconfig/tsc",
  "compilerOptions": {
    "noUncheckedIndexedAccess": false
  }
}
```