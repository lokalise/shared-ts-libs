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
const array = [1, null, 'hello', undefined, true, false, '']
const result = removeNullish(array) // Returns: [1, 'hello', true, false, '']
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
This function uses a `Set` to store unique elements and then converts it back to an array.

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

#### `groupBy`
Groups an array of objects based on the value of a specified key. This function iterates over the input array and 
organizes the objects into groups, where each group is associated with a unique key value obtained from the specified 
selector.

```typescript
const users = [
  { name: 'Alice', age: 30 },
  { name: 'Bob', age: 25 },
  { name: 'Charlie', age: 30 }
]
const groupedByAge = groupBy(users, 'age')
// Returns:{
//   25: [{ name: 'Bob', age: 25 }],
//   30: [{ name: 'Alice', age: 30 }, { name: 'Charlie', age: 30 }]
// }
```

#### `groupByPath`
Groups an array of objects based on a specified key path. This function supports nested keys, allowing the use of dot 
notation to group objects by deeply nested properties.

```typescript
const users = [
    { name: "A", address: { city: "New York" }, age: 30 },
    { name: "B", address: { city: "Los Angeles" }, age: 25 },
    { name: "C", address: { city: "New York" }, age: 35 },
]
const usersGroupedByCity = groupByPath(users, 'address.city')
// Returns:{
//   "New York": [
//      { name: "Alice", address: { city: "New York", zipCode: 10001 }, age: 30 },
//      { name: "Charlie", address: { city: "New York", zipCode: 10001 }, age: 35 }
//   ],
//   "Los Angeles": [
//      { name: "Bob", address: { city: "Los Angeles", zipCode: 90001 }, age: 25 }
//   ]
//}
```

#### `groupByUnique`
Groups an array of objects based on the unique value of a specified key. This function iterates over the input array 
and organizes the objects into groups, where each group is associated with a unique key value obtained from the 
specified selector.

If a duplicate key value is encountered, an error is thrown, ensuring the uniqueness of each key in the output.

```typescript
const users = [
  { id: 'a1', name: 'Alice' },
  { id: 'b2', name: 'Bob' }
]
const groupedById = groupByUnique(users, 'id');
// Returns:{
//   'a1': { id: 'a1', name: 'Alice' },
//   'b2': { id: 'b2', name: 'Bob' }
// }
```

#### `isEmpty`
Checks if an object or an array of objects is empty.

- For an object, it is considered empty if it has no own enumerable properties with non-undefined values.
- For an array, it is considered empty if all objects within it are empty by the same criteria.

```typescript
const emptyObject = {}
const isEmptyObj = isEmpty(emptyObject) // true
```

#### `pick`
Picks specified properties from an object and returns a new object with those properties. This function allows you to
create a subset of an object by specifying which properties should be picked. You can also control whether properties
with `undefined` or `null` values should be included in the result through the options parameter.

```typescript
const source = { a: 1, b: '2' }
const result = pick(source, ['a']) // Returns: { a: 1 }
```

#### `transformToKebabCase`
Transforms the keys of an object or array of objects from camelCase or snake_case to kebab-case. This transformation
is applied recursively, ensuring any nested objects are also processed. Non-object inputs are returned unchanged.

```typescript
const obj = { myId: 1, creationId: 1, metaObj: { updateId: 1 } }
const result = transformToKebabCase(obj)
console.log(result) // Returns: { 'my-id': 1, 'creation-date': 1, meta-obj: { 'update-date': 1 } }
```


### String Utilities
This section describes utility functions to work with strings efficiently and elegantly.

#### `trimText`
Trims whitespace and `&nbsp;` characters from the beginning and end of a given string. Extracts and provides the 
removed part as `prefix` and `suffix` properties.

```typescript
const text = '  Hello, World!  '
const result = trimText(text) // Returns: { value: 'Hello, World!', prefix: '  ', suffix: '  ' }
```


### Type Utilities
This section describes utility functions to work with types efficiently and elegantly.

#### `hasMessage`
Type guard to determine if a given value is an object with a string property `message`.

```typescript
const a = hasMessage({ message: 'Hello, world!' }) // true
const b = hasMessage({ error: 'Hello, world!' }) // true
```

#### `isError`
Type guard to determine if a given value is an `Error` object.

```typescript
const a = new Error('I am an error') // False
const b = new Error(new Error()) // True
```

#### `isObject`
Type guard to determine if a given value is a non-null object in TypeScript.

```typescript
const a = isObject(obj) // True
const b = isObject('hello') // False
```

#### `isStandardizedError`
Type guard to determine if a given value is a `StandardizedError` object. This function checks whether the provided
input conforms to the `StandardizedError` structure, which is commonly used in libraries (e.g., Fastify). 
Specifically, it verifies that the input is an object containing `code` and `message` properties, both of type `string`.

```typescript
const a = isStandardizedError({ code: 'code', message: 'test' }) // True
const b = isStandardizedError({ hello: 'world' }) // False
```


### Other Utilities
This section describes other utility functions included in this package.

#### `waitAndRetry`
Asynchronously retries a predicate function until it returns a truthy value or the maximum number of retries is
reached.

```typescript
const conditionMet = () => Math.random() > 0.9
waitAndRetry(conditionMet, 50, 10)
  .then((result) => { console.log('Condition met:', result) })
  .catch((error) => { console.error('An error occurred:', error) })
```
