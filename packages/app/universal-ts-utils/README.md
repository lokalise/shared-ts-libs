# universal-ts-utils 🧬

Isomorphic general-purpose TS utils

## Overview

The `universal-ts-utils` package provides a set of isomorphic, general-purpose TypeScript utilities for various common tasks.

## Usage

This package is designed to be used in both client (frontend) and server (backend) environments. For optimization purposes, 
it intentionally does **not** have an index file to facilitate efficient tree-shaking by frontend bundlers. 
Frontend bundlers strip out unused parts of dependencies to minimize bundle size, but an index file would include everything, 
negating this benefit.

To enhance the backend experience, we provide a `node.ts` file that aggregates and re-exports all functions, emulating 
a typical index file. Frontend imports remain modular, while backend imports can leverage the convenience of the `node.ts` 
entry point.

### Import Examples

**Frontend:**
```typescript
import { chunk } from '@lokalise/universal-ts-utils/array/chunk.js';
```

**Backend:**
```typescript
import { chunk } from '@lokalise/universal-ts-utils/node';
```


### String array equality

This package includes a function to compare string arrays, ensuring the same elements appear in the same order, using strict equality:

```typescript
import { areStringArraysEqual } from '@lokalise/universal-ts-utils/node'

const isoCodes = ['en', 'de', 'fr']
const otherIsoCodes = ['en', 'de', 'fr']

const result = areStringArraysEqual(isoCodes, otherIsoCodes)
```