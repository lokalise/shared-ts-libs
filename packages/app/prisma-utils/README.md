# Prisma utils

This package provides reusable helpers for Prisma query builder.

# Usage

```typescript
import { prismaTransaction } from '@lokalise/prisma-utils'

const result: Either<unknown, [Item, Segment]> = await prismaTransaction(prisma, [
	prisma.item.create({ data: TEST_ITEM_1 }),
	prisma.segment.create({ data: TEST_SEGMENT_1 }),
])
```

This implementation will retry the transaction on P2034 error, which satisfies Prisma recommendations for distributed databases such as CockroachDB.

### Prisma metrics plugin

Plugin to collect and send metrics to prometheus. Prisma metrics will be added to our app metrics.

Add the plugin to your Fastify instance by registering it with the following options:

- `isEnabled`;
- `collectionOptions` (by default we collect metrics `every 5 seconds`) to override default collector behaviour

Once the plugin has been added to your Fastify instance and loaded, we will start collection prisma metrics.