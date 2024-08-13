# universal-ts-utils 🧬

Isomorphic general-purpose TS utils

## Overview

The `universal-ts-utils` package provides a set of isomorphic, general-purpose TypeScript utilities for various common tasks.

### String array equality

This package includes a function to compare string arrays, ensuring the same elements appear in the same order, using strict equality:

```typescript
import { areStringArraysEqual } from '@lokalise/universal-ts-utils'

const isoCodes = ['en', 'de', 'fr']
const otherIsoCodes = ['en', 'de', 'fr']

const result = areStringArraysEqual(isoCodes, otherIsoCodes)
```