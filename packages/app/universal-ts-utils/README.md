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

## Methods


### Array

#### `callChunked`
Utility method to Process an array in chunks asynchronously.

```typescript
const items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

const processChunk = (chunk: number[]): Promise<void> => {
  console.log('Processing chunk', chunk)
}

callChunked(3, items, processChunk)
  .then(() => { console.log('All chunks processed') })
  .catch((e) => { console.error('Error processing chunks:', e) })
```

#### `chunk`
Divides the original array into smaller arrays of the given `chunkSize`.

```typescript
const numbers = [1, 2, 3, 4, 5]
const result = chunk(numbers, 2)// returns [[1, 2], [3, 4], [5]]
```

#### `isNonEmptyArray`
Checks if the given array is non-empty.

This function is a type guard that not only checks whether the array has at least one element,
but also refines the type of the array to be a tuple indicating that the first element exists.
This is useful for preventing operations on empty arrays and for gaining type-level assurances.

```typescript
const array: number[] = [1, 2, 3]
if (isNonEmptyArray(array)) {
 console.log(array[0]) // OK
 const _: [number, ...number] = array // TS type works
}
```

#### `removeFalsy`
Removes all falsy values from an array and returns a new array containing only truthy values.
    
```typescript
const array = [1, 0, 'hello', '', false, true, null, undefined]
const result = removeFalsy(array) // returns [1, 'hello', true]
```

#### `removeNullish`
Removes all nullish values from an array and returns a new array containing only non-nullish elements.

```typescript
const array = [1, null, 'hello', undefined, true]
const result = removeNullish(mixedArray)  // returns [1, 'hello', true]
```
