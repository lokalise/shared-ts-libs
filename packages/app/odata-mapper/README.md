# @lokalise/odata-mapper

Transform low-level OData AST from [@balena/odata-parser](https://github.com/balena-io-modules/odata-parser) into high-level, service-ready structures.

## Installation

```bash
npm install @lokalise/odata-mapper @balena/odata-parser
```

## Quick Start

```typescript
import { parseAndTransformFilter, extractEqualityValue, extractInValues } from '@lokalise/odata-mapper'

// Parse and transform in one step
const filter = parseAndTransformFilter("status eq 'active' and parentId in ('root', 'parent-123')")

const status = extractEqualityValue<string>(filter, 'status')     // 'active'
const parentIds = extractInValues<string>(filter, 'parentId')     // ['root', 'parent-123']
```

For more control (e.g. handling optional filters), use the two-step approach:

```typescript
import { parseODataFilter, transformFilter, extractEqualityValue } from '@lokalise/odata-mapper'

const parsed = parseODataFilter(queryString) // returns { tree: null, ... } for empty input

if (parsed.tree) {
  const filter = transformFilter(parsed.tree, parsed.binds)
  const status = extractEqualityValue<string>(filter, 'status')
}
```

## Real-World Usage

### Dynamic Filter Handling

For services where you don't know which fields users will filter on:

```typescript
import {
  parseODataFilter,
  extractAllFieldValues,
  getFilteredFieldNames,
  createFilterMap,
  transformFilter,
} from '@lokalise/odata-mapper'

// User sends: $filter=status eq 'active' and categoryId in (1, 2, 3) and contains(name, 'test')
const parsed = parseODataFilter(queryString)

if (parsed.tree) {
  // Option 1: Get all field values at once as a Map
  const fieldValues = extractAllFieldValues(parsed.tree, parsed.binds)
  // Map {
  //   'status' => ['active'],
  //   'categoryId' => [1, 2, 3],
  //   'name' => ['test']
  // }

  // Use in your database query builder
  for (const [field, values] of fieldValues) {
    if (allowedFields.includes(field)) {
      queryBuilder.where(field, values.length === 1 ? values[0] : values)
    }
  }

  // Option 2: Check which fields are being filtered
  const filter = transformFilter(parsed.tree, parsed.binds)
  const filteredFields = getFilteredFieldNames(filter)
  // ['status', 'categoryId', 'name']

  // Option 3: Get full filter details with createFilterMap
  const filterMap = createFilterMap(filter)
  for (const [field, filters] of filterMap) {
    for (const f of filters) {
      if (f.type === 'comparison') {
        // Handle equality, gt, lt, etc.
      } else if (f.type === 'in') {
        // Handle IN filters
      } else if (f.type === 'string-function') {
        // Handle contains, startswith, etc.
      }
    }
  }
}
```

### Known Field Extraction

When you know the specific fields your service supports:

```typescript
import {
  parseAndTransformFilter,
  extractEqualityValue,
  extractInValues,
  extractRange,
  extractStringFunction,
  findUnsupportedField,
} from '@lokalise/odata-mapper'

const filter = parseAndTransformFilter(queryString)

// Validate that only allowed fields are used
const SUPPORTED = new Set(['status', 'categoryId', 'price', 'name'])
const unsupported = findUnsupportedField(filter, SUPPORTED)
if (unsupported) {
  throw new Error(`Unsupported filter field: ${unsupported}`)
}

// Extract only the fields you support (undefined if not present)
const filters = {
  status: extractEqualityValue<string>(filter, 'status'),
  categoryIds: extractInValues<number>(filter, 'categoryId'),
  priceRange: extractRange(filter, 'price'),
  nameSearch: extractStringFunction(filter, 'name', 'contains')?.value,
}

// Build your query conditionally
const query = db.select().from('products')
if (filters.status) query.where('status', filters.status)
if (filters.categoryIds) query.whereIn('categoryId', filters.categoryIds)
if (filters.priceRange?.min) query.where('price', '>=', filters.priceRange.min)
if (filters.priceRange?.max) query.where('price', '<=', filters.priceRange.max)
if (filters.nameSearch) query.whereLike('name', `%${filters.nameSearch}%`)
```

### Parent Filter Use Case

```typescript
import { parseAndTransformFilter, extractInValues } from '@lokalise/odata-mapper'

// Parse: $filter=parentId in ('root', 'parent-123', 'parent-456')
const filter = parseAndTransformFilter(queryString)
const parentIds = extractInValues<string>(filter, 'parentId')
// ['root', 'parent-123', 'parent-456']

// Use directly in your service
const files = await fileService.getFilesForParents(parentIds)
```

### Error Handling

```typescript
import { parseODataFilter, ODataParseError } from '@lokalise/odata-mapper'

try {
  const parsed = parseODataFilter(userInput)
  // ... use parsed result
} catch (error) {
  if (error instanceof ODataParseError) {
    console.error(`Invalid filter: ${error.filter}`)
    console.error(`Cause: ${error.cause?.message}`)
    // Return 400 Bad Request to user
  }
  throw error
}
```

## API Reference

### Parsing

#### `parseODataFilter(filter)`

Convenience wrapper for parsing OData $filter expressions. Handles null/empty strings gracefully and provides structured error handling.

```typescript
const parsed = parseODataFilter("status eq 'active'")
// { tree: FilterTreeNode | null, binds: ODataBinds, originalFilter: string | undefined }

// Handle empty/null filters
const empty = parseODataFilter(undefined)
// { tree: null, binds: [], originalFilter: undefined }
```

#### `parseAndTransformFilter(filter)`

Convenience function that combines `parseODataFilter` + `transformFilter` in one step. Throws if the filter is empty or invalid, so the result is always a ready-to-use `TransformedFilter`.

```typescript
import { parseAndTransformFilter, extractEqualityValue } from '@lokalise/odata-mapper'

const filter = parseAndTransformFilter("status eq 'active'")
const status = extractEqualityValue<string>(filter, 'status') // 'active'
```

Throws `ODataParseError` for empty, whitespace-only, or syntactically invalid filters.

#### `safeParseAndTransformFilter(filter, mapError)`

Like `parseAndTransformFilter`, but catches `ODataParseError` and lets you map it to your own error type. Non-`ODataParseError` errors are re-thrown as-is.

```typescript
import { safeParseAndTransformFilter } from '@lokalise/odata-mapper'

const filter = safeParseAndTransformFilter(
  queryString,
  (e) => new FilterNotSupportedError({
    message: `Invalid filter: ${e.message}`,
    details: { filter: e.filter },
  }),
)
```

#### `ODataParseError`

Custom error class thrown when parsing fails. Includes the original filter string and cause.

```typescript
class ODataParseError extends Error {
  filter: string      // The original filter string that failed to parse
  cause?: Error       // The underlying parser error
}
```

### Core Transformation

#### `transformFilter(tree, binds, options?)`

Transforms a filter AST into a high-level `TransformedFilter` structure.

```typescript
const filter = transformFilter(parsed.tree, parsed.binds)
// Returns: TransformedFilter (ComparisonFilter | InFilter | LogicalFilter | ...)
```

### Value Extraction

#### `extractEqualityValue<T>(filter, fieldName)`

Extracts a single value from an equality comparison (`eq` operator).

```typescript
const status = extractEqualityValue<string>(filter, 'status')
const isActive = extractEqualityValue<boolean>(filter, 'isActive')
const deletedAt = extractEqualityValue(filter, 'deletedAt') // null if eq null
```

#### `extractInValues<T>(filter, fieldName)`

Extracts an array of values from an `in` filter.

```typescript
const parentIds = extractInValues<string>(filter, 'parentId')
// ['root', 'parent-123', 'parent-456']
```

#### `extractFieldValues<T>(filter, fieldName)`

Universal extraction that works for both equality and `in` filters. Always returns an array.

```typescript
// Works for eq: status eq 'active' -> ['active']
// Works for in: status in ('a', 'b') -> ['a', 'b']
const values = extractFieldValues<string>(filter, 'status')
```

#### `extractComparison(filter, fieldName, operator)`

Extracts a comparison filter for any operator.

```typescript
const priceGt = extractComparison(filter, 'price', 'gt')
// { type: 'comparison', field: 'price', operator: 'gt', value: 100 }
```

#### `extractRange(filter, fieldName)`

Extracts range filters from combined `gt/ge` and `lt/le` operators.

```typescript
// From: price ge 100 and price le 500
const range = extractRange(filter, 'price')
// { min: 100, minInclusive: true, max: 500, maxInclusive: true }
```

#### `extractInclusiveRange(filter, fieldName)`

Like `extractRange`, but enforces that only inclusive operators (`ge`/`le`) are used. Returns a simplified `{ min?, max? }` without inclusivity flags. Throws if `gt` or `lt` operators are found.

```typescript
// From: price ge 100 and price le 500
const range = extractInclusiveRange(filter, 'price')
// { min: 100, max: 500 }

// From: price gt 100 — throws Error
```

#### `extractStringFunction(filter, fieldName, functionName?)`

Extracts string function filters (contains, startswith, endswith, substringof).

```typescript
const search = extractStringFunction(filter, 'name', 'contains')
// { type: 'string-function', function: 'contains', field: 'name', value: 'John' }
```

### Filter Inspection

#### `hasFieldFilter(filter, fieldName)`

Checks if a field is filtered anywhere in the filter tree.

```typescript
if (hasFieldFilter(filter, 'category')) {
  // category is being filtered
}
```

#### `getFilteredFieldNames(filter)`

Returns all field names that are filtered.

```typescript
const fields = getFilteredFieldNames(filter)
// ['status', 'price', 'name']
```

#### `getFiltersForField(filter, fieldName)`

Returns all filters for a specific field (useful when a field appears multiple times).

```typescript
const priceFilters = getFiltersForField(filter, 'price')
// Could return multiple filters: [{ operator: 'ge', ... }, { operator: 'le', ... }]
```

#### `findUnsupportedField(filter, supportedFields)`

Returns the first field name that is not in the supported set, or `undefined` if all fields are supported. Accepts a `Set<string>` or `string[]`.

```typescript
import { parseAndTransformFilter, findUnsupportedField } from '@lokalise/odata-mapper'

const filter = parseAndTransformFilter("status eq 'active' and priority gt 5")

const unsupported = findUnsupportedField(filter, new Set(['status']))
// 'priority'

const allGood = findUnsupportedField(filter, new Set(['status', 'priority']))
// undefined
```

### Bulk Extraction

#### `extractAllFieldValues(tree, binds)`

Extracts all field values from a filter in one pass. Returns a `Map<string, FilterValue[]>`.

```typescript
const fieldValues = extractAllFieldValues(parsed.tree, parsed.binds)
// Map {
//   'status' => ['active'],
//   'categoryId' => [1, 2, 3]
// }
```

### Filter Collection

#### `flattenFilters(filter)`

Flattens nested logical filters into a single array.

```typescript
const allFilters = flattenFilters(filter)
// Array of all leaf filters (comparisons, ins, string functions)
```

#### `collectAndFilters(filter)` / `collectOrFilters(filter)`

Collects filters from AND/OR logical groups.

```typescript
const andFilters = collectAndFilters(filter)  // Filters that must all match
const orFilters = collectOrFilters(filter)    // Filters where any can match
```

## Supported Filter Types

### Comparison Operators

- `eq` - Equal
- `ne` - Not equal
- `gt` - Greater than
- `ge` - Greater than or equal
- `lt` - Less than
- `le` - Less than or equal

### Logical Operators

- `and` - All conditions must match
- `or` - Any condition can match
- `not` - Negates a condition

### String Functions

- `contains(field, 'value')`
- `startswith(field, 'prefix')`
- `endswith(field, 'suffix')`
- `substringof('value', field)`
- `tolower(field)`
- `toupper(field)`

### Collection Operator

- `in` - Value is in a list: `field in ('a', 'b', 'c')`

### Nested Properties

Supports nested property access: `address/city eq 'NYC'`

### Low-Level Utilities

These utilities are exported for advanced use cases such as building custom transformers or working directly with the balena parser AST.

#### Bind Resolution

```typescript
import {
  resolveBind,           // Resolve a single bind reference to its value
  resolveBinds,          // Resolve multiple bind references
  isBindReference,       // Type guard for bind references
  getBindKey,            // Get the key from a bind reference
  extractBindTupleValue, // Extract value from a [type, value] bind tuple
  extractBindTupleValues,// Extract values from an array of bind tuples
} from '@lokalise/odata-mapper'
```

#### AST Utilities

```typescript
import {
  isFieldReference,      // Type guard for field references
  getFieldPath,          // Get dot/slash path from nested field reference
  transformFilterNode,   // Transform a single AST node (lower-level than transformFilter)
} from '@lokalise/odata-mapper'
```

## Types

```typescript
import type {
  // Parser types
  ParsedODataFilter,

  // Filter types
  TransformedFilter,
  ComparisonFilter,
  InFilter,
  NotInFilter,
  LogicalFilter,
  NotFilter,
  StringFunctionFilter,

  // Value types
  FilterValue,
  ComparisonOperator,
  LogicalOperator,
  StringFunction,

  // AST node types (for custom transformer logic)
  FilterTreeNode,
  ComparisonNode,
  LogicalNode,
  InNode,
  NotNode,
  FunctionCallNode,
  FieldReference,

  // Utility types
  TransformOptions,
  RawBindValue,
  FieldFilterResult,
  ParsedFilter,
} from '@lokalise/odata-mapper'
```

Re-exported types from `@balena/odata-parser` are also available: `BindKey`, `BindReference`, `ODataBinds`, `ODataOptions`, `ODataQuery`, `PropertyPath`, `TextBind`, `NumberBind`, `BooleanBind`, `DateBind`, `FilterOption`.

## License

[Apache-2.0](./LICENSE.md)
