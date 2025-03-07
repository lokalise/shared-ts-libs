# @lokalise/tsconfig

Shared TypeScript configuration for Lokalise projects.

## Getting Started

### Requirements:
- TypeScript `^5.8.0`
- ESM codebase

### Installation:
```bash
npm install --save-dev @lokalise/tsconfig
```

TypeScript configuration depends on whether you're using `tsc` to build your code or a `bundler` (Vite, esbuild, SWC, etc.).

## **Using a Bundler**

Create a `tsconfig.json` for type-checking:

```jsonc
{
  "extends": "@lokalise/tsconfig/bundler",
  "extends": "@lokalise/tsconfig/bundler-dom", // When your code runs in the DOM
  // Whitelist files that should be used for type-checking:
  "include": ["src/**/*", "test/**/*", "vitest.config.ts"]
}
```
**Note:** Choose only one `"extends"` option for `tsconfig.json`.

## **Using `tsc` (TypeScript Compiler)**

Create a `tsconfig.json` for type-checking:

```jsonc
{
  "extends": "@lokalise/tsconfig/tsc",
  "extends": "@lokalise/tsconfig/tsc-dom", // When your code runs in the DOM
  // Whitelist files that should be used for type-checking:
  "include": ["src/**/*", "test/**/*", "vitest.config.ts"]
}
```
**Note:** Choose only one `"extends"` option for `tsconfig.json`.

Create a `tsconfig.build.json` for building the code:

```jsonc
{
  "extends": ["./tsconfig.json", "@lokalise/tsconfig/build-app"], // For an app
  "extends": ["./tsconfig.json", "@lokalise/tsconfig/build-public-lib"], // For a publishable library
  "extends": ["./tsconfig.json", "@lokalise/tsconfig/build-private-lib"], // For a private monorepo library
  "include": ["src/**/*"], // Include only necessary files
  "exclude": ["src/**/*.test.ts"] // Exclude unneeded files from the build output
}
```

**Note:** Choose only one `"extends"` option for `tsconfig.build.json`.

## **Additional Configuration Options**

### **JSX Support**
If your app uses JSX, specify it in `tsconfig.json`:

```json
{
  "extends": "@lokalise/tsconfig/bundler-dom",
  "compilerOptions": {
    "jsx": "react-jsx"
  }
}
```

### **Adding Global Types**
To include additional type definitions:

```json
{
  "extends": "@lokalise/tsconfig/tsc",
  "compilerOptions": {
    "types": ["vitest/globals"]
  }
}
```

## **Options That Can Be Disabled for Migration**

### **`erasableSyntaxOnly`**

[erasableSyntaxOnly](https://www.typescriptlang.org/tsconfig/#erasableSyntaxOnly)
marks the following syntax as errors:
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

### **`noUncheckedIndexedAccess`**
[noUncheckedIndexedAccess](https://www.typescriptlang.org/tsconfig/#noUncheckedIndexedAccess)
ensures that accessing arrays or objects without checking if a value exists first results in a TypeScript error, preventing potential runtime crashes.

**Example for accessing the array:**
```typescript
const arr: string[] = [];

console.log(arr[0].trim());
// With `"noUncheckedIndexedAccess": true` → TypeScript error: "Object is possibly `undefined`"
// With `"noUncheckedIndexedAccess": false` → No error, but at runtime, this will throw:
// "TypeError: Cannot read properties of undefined (reading 'trim')"
```

**Example for accessing the object:**
```typescript
const obj: Record<string, string> = {};

console.log(obj.some.trim());
// With `"noUncheckedIndexedAccess": true` → TypeScript error: "`obj.some` is possibly `undefined`"
// With `"noUncheckedIndexedAccess": false` → No error, but at runtime, this will throw:
// "TypeError: Cannot read properties of undefined (reading 'trim')"
```

To disable:
```json
{
  "extends": "@lokalise/tsconfig/tsc",
  "compilerOptions": {
    "noUncheckedIndexedAccess": false
  }
}
```
