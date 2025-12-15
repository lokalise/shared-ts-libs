# @lokalise/odata-mapper

Transform low-level OData AST from [@balena/odata-parser](https://github.com/balena-io-modules/odata-parser) into high-level, service-ready structures.

## Installation

```bash
npm install @lokalise/odata-mapper @balena/odata-parser
```

## Overview

This library takes the output of `@balena/odata-parser` and transforms it into easy-to-use data structures for building web services. Instead of manually traversing complex AST nodes and resolving bind references, you get clean filter objects ready for use in your application logic.

## Quick Start

```typescript
import { parse } from '@balena/odata-parser'
import { transformFilter, extractEqualityValue, extractInValues } from '@lokalise/odata-mapper'

// Parse an OData filter query
const result = parse("$filter=status eq 'active' and parentId in ('root', 'parent-123')", {
  startRule: 'ProcessRule',
  rule: 'QueryOptions',
})

// Transform the AST into a high-level filter structure
const filter = transformFilter(result.tree.$filter, result.binds)

// Extract specific field values
const status = extractEqualityValue<string>(filter, 'status') // 'active'
const parentIds = extractInValues<string>(filter, 'parentId')   // ['root', 'parent-123']
```

## API Reference

### Core Transformation

#### `transformFilter(tree, binds, options?)`

Transforms a filter AST into a high-level `TransformedFilter` structure.

```typescript
import { transformFilter } from '@lokalise/odata-mapper'

const filter = transformFilter(result.tree.$filter, result.binds)
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

#### `extractComparison(filter, fieldName, operator?)`

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

### Bulk Extraction

#### `extractAllFieldValues(tree, binds)`

Extracts all field values from a filter in one pass. Returns a `Map<string, FilterValue[]>`.

```typescript
const result = parse("$filter=status eq 'active' and categoryId in (1, 2, 3)", {
  startRule: 'ProcessRule',
  rule: 'QueryOptions',
})

const fieldValues = extractAllFieldValues(result.tree.$filter, result.binds)
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

### Collection Operator

- `in` - Value is in a list: `field in ('a', 'b', 'c')`

### Nested Properties

Supports nested property access: `address/city eq 'NYC'`

## Types

```typescript
import type {
  TransformedFilter,
  ComparisonFilter,
  InFilter,
  LogicalFilter,
  NotFilter,
  StringFunctionFilter,
  FilterValue,
  ComparisonOperator,
  LogicalOperator,
  StringFunction,
} from '@lokalise/odata-mapper'
```

## Real-World Examples

### Dynamic Filter Handling

For services where you don't know which fields users will filter on:

```typescript
import { parse } from '@balena/odata-parser'
import {
  extractAllFieldValues,
  getFilteredFieldNames,
  createFilterMap,
  transformFilter,
} from '@lokalise/odata-mapper'

// User sends: $filter=status eq 'active' and categoryId in (1, 2, 3) and contains(name, 'test')
const result = parse(queryString, {
  startRule: 'ProcessRule',
  rule: 'QueryOptions',
})

// Option 1: Get all field values at once as a Map
const fieldValues = extractAllFieldValues(result.tree.$filter, result.binds)
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
const filteredFields = getFilteredFieldNames(transformFilter(result.tree.$filter, result.binds))
// ['status', 'categoryId', 'name']

// Option 3: Get full filter details with createFilterMap
const filterMap = createFilterMap(transformFilter(result.tree.$filter, result.binds))
for (const [field, filters] of filterMap) {
  for (const filter of filters) {
    if (filter.type === 'comparison') {
      // Handle equality, gt, lt, etc.
    } else if (filter.type === 'in') {
      // Handle IN filters
    } else if (filter.type === 'string-function') {
      // Handle contains, startswith, etc.
    }
  }
}
```

### Known Field Extraction

When you know the specific fields your service supports:

```typescript
import { parse } from '@balena/odata-parser'
import {
  transformFilter,
  extractEqualityValue,
  extractInValues,
  extractRange,
  extractStringFunction,
} from '@lokalise/odata-mapper'

const result = parse(queryString, {
  startRule: 'ProcessRule',
  rule: 'QueryOptions',
})

const filter = transformFilter(result.tree.$filter, result.binds)

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

### Parent Filter Use Case (Original Request)

```typescript
import { parse } from '@balena/odata-parser'
import { transformFilter, extractInValues } from '@lokalise/odata-mapper'

// Parse: $filter=parentId in ('root', 'parent-123', 'parent-456')
const result = parse(queryString, {
  startRule: 'ProcessRule',
  rule: 'QueryOptions',
})

const filter = transformFilter(result.tree.$filter, result.binds)
const parentIds = extractInValues<string>(filter, 'parentId')
// ['root', 'parent-123', 'parent-456']

// Use directly in your service
const files = await fileService.getFilesForParents(parentIds)
```

## License

MIT
