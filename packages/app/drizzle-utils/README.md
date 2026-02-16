# Drizzle utils

This package provides reusable helpers for Drizzle ORM.

## Installation

```bash
npm install @lokalise/drizzle-utils
```

Peer dependency: `drizzle-orm` (<1.0.0)

## Usage

### drizzleFullBulkUpdate

Performs efficient bulk updates using a single SQL query with a `VALUES` clause. This is more efficient than executing multiple individual UPDATE statements and more effective than INSERT ON CONFLICT UPDATE (UPSERT) for update-only operations.

```typescript
import { drizzleFullBulkUpdate } from '@lokalise/drizzle-utils'
import { drizzle } from 'drizzle-orm/postgres-js'
import { pgTable, smallint } from 'drizzle-orm/pg-core'

const db = drizzle(connectionString)

const users = pgTable('users', {
  id: smallint('id').primaryKey(),
  name: smallint('name'),
  age: smallint('age'),
})

// Update multiple rows in a single query
await drizzleFullBulkUpdate(db, users, [
  { where: { id: 1 }, data: { name: 'Alice', age: 30 } },
  { where: { id: 2 }, data: { name: 'Bob', age: 25 } },
  { where: { id: 3 }, data: { name: 'Charlie', age: 35 } },
])
```

This generates an efficient SQL query of the form:

```sql
UPDATE "public"."users" AS tbl
SET "name" = updates."name"::smallint, "age" = updates."age"::smallint
FROM (
  VALUES
    (1, 'Alice', 30),
    (2, 'Bob', 25),
    (3, 'Charlie', 35)
) AS updates("id", "name", "age")
WHERE tbl."id" = updates."id"::smallint
```

#### Features

- **Efficient bulk updates**: All updates are performed in a single SQL query
- **Type-safe**: Fully typed with TypeScript and Drizzle schema definitions
- **Composite key support**: Works with both single and composite primary keys
- **JSON support**: Handles JSON/JSONB columns correctly
- **Transactional**: The entire bulk update is atomic - either all updates succeed or all are rolled back

#### Constraints

- The `entries` array must not be empty
- All `where` objects must have the same set of keys
- All `data` objects must have the same set of keys
- Both `where` and `data` objects must not be empty

#### Composite Key Example

```typescript
const orderItems = pgTable('order_items', {
  orderId: smallint('order_id'),
  itemId: smallint('item_id'),
  quantity: smallint('quantity'),
  price: smallint('price'),
})

await drizzleFullBulkUpdate(db, orderItems, [
  { where: { orderId: 1, itemId: 1 }, data: { quantity: 5, price: 100 } },
  { where: { orderId: 1, itemId: 2 }, data: { quantity: 3, price: 75 } },
])
```
