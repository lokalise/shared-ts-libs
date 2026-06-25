# @lokalise/odata-filter

In-memory OData 4.0 `$filter` evaluation for plain JavaScript objects.

## Installation

```bash
pnpm add @lokalise/odata-filter @balena/odata-parser
```

`@balena/odata-parser` is a peer dependency used to parse filter expressions.

## Usage

```typescript
import { filterObjects } from '@lokalise/odata-filter'

const users = [
  { name: 'Alice', status: 'active', price: 15 },
  { name: 'Bob', status: 'archived', price: 5 },
]

const { items, truncated } = filterObjects("status eq 'active' and price gt 10", users)

// items: [{ name: 'Alice', status: 'active', price: 15 }]
// truncated: false
```

### Parameter aliases

```typescript
filterObjects("contains(name, @term)", users, {
  binds: { term: 'Ali' },
})
```

Pass alias values in `options.binds` (without the `@` prefix). Missing aliases resolve to `null`.

### Limit results

```typescript
filterObjects("status eq 'active'", users, { limit: 50 })
```

When `limit` is set, `items` contains at most that many matches (in input order). `truncated` is `true` when more than `limit` objects matched. The full input array is still scanned so `truncated` is accurate.

## API

| Export | Description |
|--------|-------------|
| `filterObjects(filter, objects, options?)` | Parse and evaluate a `$filter` over an array of plain objects |
| `FilterOptions` | `binds?: Record<string, unknown>`, `limit?: number` |
| `FilterResult` | `{ items, truncated }` |
| `ODataParseError` | Invalid or empty filter syntax |
| `UnsupportedConstructError` | Parsed expression uses an unsupported operator or function |
| `ODataEvaluationError` | Runtime evaluation failure (e.g. integer division by zero) |
| `ODataFilterError` | Base class for the errors above |

## Supported constructs

### Operators

| Category | Operators |
|----------|-----------|
| Comparison | `eq`, `ne`, `gt`, `ge`, `lt`, `le` |
| Logical | `and`, `or`, `not` |
| Arithmetic | `add`, `sub`, `mul`, `div`, `mod` |

### Paths and collections

- Nested properties: `address/city`
- Collection navigation with lambdas: `items/any(i:i/quantity gt 10)`, `tags/all(t:t eq 'a')`
- Collection emptiness: `tags/any()`
- Collection count: `items/$count gt 1`

Lambda semantics:

- `any` on an empty collection → `false`
- `all` on an empty collection → `true`
- Non-array collection values in lambdas → `false`
- `null` / missing collection → predicate evaluates to unknown; row is excluded

### String functions

`concat`, `contains`, `endswith`, `indexof`, `length`, `startswith`, `substring`, `tolower`, `toupper`, `trim`

`length` counts Unicode code points (not UTF-16 code units).

### Date and time functions

`date`, `day`, `fractionalseconds`, `hour`, `maxdatetime`, `mindatetime`, `minute`, `month`, `now`, `second`, `time`, `totaloffsetminutes`, `totalseconds`, `year`

Date parts use UTC. `date()` returns a date-only `Date` at UTC midnight.

### Math functions

`ceiling`, `floor`, `round`

### Literals and parameters

- String, number, boolean, and `null` literals
- Parser-embedded literals from the parsed expression
- Parameter aliases: `@name` (values from `options.binds`)

## Null and type semantics

Missing object properties are treated as `null`.

Comparisons use OData-style null propagation:

- `eq` / `ne`: `null eq null` → true; `null eq value` → false; `null ne value` → true
- `gt` / `lt`: either operand null → false
- `ge` / `le`: both null → true; one null → false

`and`, `or`, and `not` use three-valued logic. A row is included only when the top-level predicate is **true**; `false` and unknown (`null`) both exclude the row.

For ordering and equality, ISO date strings matching `YYYY-MM-DD…` are coerced to `Date` when compared to dates or other such strings.

Arithmetic with a null operand yields `null`. Non-numeric operands in arithmetic yield `null`.

Integer `div` / `mod` by zero throws `ODataEvaluationError`. Non-integer division follows JavaScript floating-point rules.

## Unsupported constructs

These throw `UnsupportedConstructError` at parse or evaluation time:

| Construct | Reason |
|-----------|--------|
| `in` | OData 4.01 |
| `substringof` | Deprecated; use `contains` |
| `has`, `eqany` | Not supported |
| Unknown functions | Not implemented |
| `$expand` and query options other than `$filter` | Out of scope |

## Behavioral notes

This library evaluates filters against in-memory objects. It is **not** a full OData service implementation.

| Topic | Behavior |
|-------|----------|
| `now()` | Returns a new `Date` on each evaluation (can differ between rows in one call) |
| `totaloffsetminutes()` | Always returns `0` (no timezone offset from object data) |
| `tolower` / `toupper` | Uses locale-aware casing (`toLocaleLowerCase` / `toLocaleUpperCase`) |
| Performance | Each call parses the filter once, then evaluates every input object (even when `limit` is set) |
| Input | Objects are not cloned or mutated; matching references are returned in `items` |

## License

[Apache-2.0](./LICENSE.md)
