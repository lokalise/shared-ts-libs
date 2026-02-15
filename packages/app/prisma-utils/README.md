# Prisma utils

This package provides reusable helpers for Prisma query builder.

## Installation

```bash
npm install @lokalise/prisma-utils
```

## Features

### Prisma Client Factory

Factory function to create a Prisma client instance with default configuration and optional Prometheus metrics integration.

**Without metrics:**

```typescript
import { prismaClientFactory } from '@lokalise/prisma-utils'
import { PrismaClient } from '@prisma/client'

const prisma = prismaClientFactory(PrismaClient, {
  // Your Prisma client options
})
```

**With Prometheus metrics:**

```typescript
import { prismaClientFactory } from '@lokalise/prisma-utils'
import { PrismaClient } from '@prisma/client'
import * as promClient from 'prom-client'

const prisma = prismaClientFactory(
  PrismaClient,
  {
    // Your Prisma client options
  },
  { promClient }
)
```

The factory automatically:
- Sets default transaction isolation level to `ReadCommitted`
- Extends the client with Prometheus metrics when `promClient` is provided

#### Prisma Metrics Collection

When you provide `promClient` to the factory, the following metrics are automatically collected:

- **`prisma_queries_total`**: Total number of Prisma queries executed
  - Labels: `model`, `operation`, `status` (success/error)
- **`prisma_query_duration_seconds`**: Duration of Prisma queries in seconds
  - Labels: `model`, `operation`
  - Buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 5]
- **`prisma_errors_total`**: Total number of Prisma query errors
  - Labels: `model`, `operation`, `error_code`

These metrics are automatically exposed through the Prometheus registry and can be scraped by your monitoring system.

### Prisma Transactions

Helper for executing Prisma transactions with intelligent automatic retry mechanism, optimized for distributed databases like CockroachDB.

#### Basic Usage

**With multiple operations:**

```typescript
import { prismaTransaction } from '@lokalise/prisma-utils'
import type { Either } from '@lokalise/node-core'

const result: Either<unknown, [Item, Segment]> = await prismaTransaction(
  prisma,
  { dbDriver: 'CockroachDb' },
  [
    prisma.item.create({ data: { value: 'item-1' } }),
    prisma.segment.create({ data: { name: 'segment-1' } }),
  ]
)
```

**With transaction callback:**

```typescript
const result: Either<unknown, User> = await prismaTransaction(
  prisma,
  { dbDriver: 'CockroachDb' },
  async (tx) => {
    const user = await tx.user.create({ data: { name: 'John' } })
    await tx.profile.create({ data: { userId: user.id, bio: 'Developer' } })
    return user
  }
)
```

#### Automatic Retry Mechanism

The transaction helper automatically retries on the following error conditions:

**Prisma Error Codes:**
- **P2034**: Write conflict / Serialization failure (common in distributed databases)
- **P2028**: Transaction API error
- **P1017**: Server closed the connection

**CockroachDB-specific:**
- Automatically detects and retries CockroachDB retry transaction errors.

#### Retry Strategy

1. **Exponential Backoff**: Delay between retries increases exponentially
   - Formula: `2^(retry-1) × baseRetryDelayMs`
   - Example: 100ms → 200ms → 400ms → 800ms...

2. **Smart Timeout Adjustment**: If transaction times out (P2028 with "transaction is closed"), the timeout is 
 automatically doubled on retry (up to `maxTimeout`)

3. **Configurable Options**:

```typescript
const result = await prismaTransaction(
  prisma,
  {
    dbDriver: 'CockroachDb',       // Enable CockroachDB-specific retries
    retriesAllowed: 2,             // Default: 2 (total 3 attempts)
    baseRetryDelayMs: 100,         // Default: 100ms
    maxRetryDelayMs: 30000,        // Default: 30s (max delay between retries)
    timeout: 5000,                 // Default: 5s (transaction timeout)
    maxTimeout: 30000,             // Default: 30s (max transaction timeout)
  },
  [
    // Your transaction operations
  ]
)
```

#### Why This Matters

Distributed databases like CockroachDB use optimistic concurrency control, which can result in serialization errors 
when multiple transactions compete for the same resources. This helper abstracts away the complexity of handling these 
errors, providing a robust and efficient way to ensure your transactions succeed even under high contention.
By automatically retrying failed transactions with an intelligent backoff strategy, you can significantly improve the 
reliability and performance of your application when using distributed databases.
