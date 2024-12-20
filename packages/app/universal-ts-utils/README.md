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

### Array Utilities
This section describes utility functions to work with arrays efficiently and elegantly.

#### `callChunked`
A utility method to process an array in chunks asynchronously.

```typescript
const items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
const processChunk = (chunk: number[]): Promise<void> => {
  console.log('Processing chunk', chunk)
  return Promise.resolve()
};

callChunked(3, items, processChunk)
  .then(() => { console.log('All chunks processed') })
  .catch((e) => { console.error('Error processing chunks:', e) })
```

#### `chunk`
Divides the original array into smaller arrays, each of the specified `chunkSize`.

```typescript
const numbers = [1, 2, 3, 4, 5]
const result = chunk(numbers, 2) // Returns: [[1, 2], [3, 4], [5]]
```

#### `isNonEmptyArray`
Checks if the given array is non-empty. This function acts as a type guard to confirm that the array contains at least 
one element, and it refines the type to a tuple, indicating that the first element exists. This is useful to ensure 
operations are not performed on empty arrays, providing type-level assurances.

```typescript
const array: number[] = [1, 2, 3]
if (isNonEmptyArray(array)) {
  console.log(array[0]) // OK
  const _: [number, ...number[]] = array // TS type works
}
```

#### `removeFalsy`
Removes all falsy values from an array and returns a new array containing only truthy values.

```typescript
const array = [1, 0, 'hello', '', false, true, null, undefined]
const result = removeFalsy(array) // Returns: [1, 'hello', true]
```

#### `removeNullish`
Removes all nullish values from an array and returns a new array containing only non-nullish elements.

```typescript
const array = [1, null, 'hello', undefined, true]
const result = removeNullish(array) // Returns: [1, 'hello', true]
```

#### `sort`
Sorts an array of strings or numbers in either ascending or descending order. This function returns a sorted copy of 
the original array and does not modify the input, making it safe to use without side effects.

```typescript
const a = sort([3, 1, 2]) // Returns: [1, 2, 3]
const b = sort([3, 1, 2], 'desc') // Returns: [3, 2, 1]
```

#### `sortByField`
Sorts an array of objects based on a specified field and order. This function returns a sorted copy of the original 
array and does not affect the original, ensuring no side effects.

```typescript
const data = [
  { name: 'Zara', age: 22 },
  { name: 'Alex', age: 30 },
  { name: 'John', age: 25 }
]
const sortedByName = sortByField(data, 'name')
// Returns: [
//   { name: 'Alex', age: 30 },
//   { name: 'John', age: 25 },
//   { name: 'Zara', age: 22 }
// ]
```

#### `unique`
Returns a new array containing only unique elements from the given array while preserving the order of first occurrence.

```typescript
const numbers = [1, 2, 2, 3, 4, 4, 5]
const result = unique(numbers) // Returns: [1, 2, 3, 4, 5]
```

### Object Utilities
This section describes utility functions to work with objects efficiently and elegantly.

#### `areDeepEqual`
Determines if two values are deeply equal. This function handles primitive types, arrays, and objects. For arrays and 
objects, it performs a recursive equality check.

```typescript
areDeepEqual(1, 1) // true
areDeepEqual([1, 2], [1, 2]) // true
areDeepEqual({ name: 'John' }, { name: 'John' }) // true
areDeepEqual(null, null) // true
areDeepEqual(undefined, null) // false
areDeepEqual([1, [2, 3]], [1, [2, 3]]) // true
areDeepEqual([{ id: 1 }], [{ id: 1 }]) // true
```

#### `convertDateFieldsToIsoString`
Recursively converts all Date fields in an object or array of objects to ISO string format. This function retains the
structure of the input, ensuring non-Date fields remain unchanged, while Date fields are replaced with their ISO string 
representations.

```typescript
const obj = { id: 1, created: new Date(), meta: { updated: new Date() } }
const result = convertDateFieldsToIsoString(obj)
// Returns: { 
//   id: 1,
//   created: '2024-01-01T00:00:00.000Z', 
//   meta: { updated: '2024-01-01T00:00:00.000Z' }
// }
```

#### `copyWithoutEmpty`
Creates a shallow copy of an object, excluding properties with "empty" values. An "empty" value includes `null`, 
`undefined`, and empty strings (`''`).

```typescript
const source = {
  name: 'Alice',
  age: null,
  occupation: '',
  location: 'Wonderland',
  status: undefined
}
const result = copyWithoutEmpty(source); // Returns: { name: 'Alice', location: 'Wonderland' }
```

#### `copyWithoutNullish`
Creates a shallow copy of an object, excluding properties with nullish values.

```typescript
const source = {
  name: 'Alice',
  age: null,
  occupation: 'Explorer',
  location: undefined,
  status: 'Active'
}
const result = copyWithoutNullish(source) // Returns: { name: 'Alice', occupation: 'Explorer', status: 'Active' }
```

#### `deepClone`
Returns a deep cloned copy of an object.

This function utilizes the `structuredClone` method, which is capable of deep cloning complex objects, including
nested structures. However, it has limitations and does not support cloning functions, Error objects, WeakMap,
WeakSet, DOM nodes, and certain other browser-specific objects like Window.

When using this methid be aware of `structuredClone` limitations, be aware of its limitations. It cannot clone 
functions, Error objects, certain web platform objects, and symbols, among others. For such cases, consider using 
custom cloning logic.

```typescript
const original = { name: 'Alice', details: { age: 30 } }
const cloned = deepClone(original)
// cloned will be a deep copy of original, and modifying cloned will not affect original
```

#### ``

#### ``
