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
