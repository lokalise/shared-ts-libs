# type coercion

This package includes a few common helpers for doing type coercion following [these rules](https://ajv.js.org/coercion.html) using [preprocessors](https://github.com/colinhacks/zod#preprocess).

Values that does not fit the rules specification will not be coerced, and will continue to validation as-is.

## toStringPreprocessor

The `toStringPreprocessor` will attempt to convert values to strings.

```typescript
import { z } from 'zod'

const schema = z.object({
    age: z.preprocess(toStringPreprocessor, z.string()),
    isActive: z.preprocess(toStringPreprocessor, z.string()),
    createdAt: z.preprocess(toStringPreprocessor, z.string()),
})

const input = {
    age: 44,
    isActive: true,
    createdAt: new Date('2022-01-01'),
}

const result = schema.parse(input)

// `result` will now contain the following values
{
    age: '44',
    isActive: 'true',
    createdAt: '2022-01-01T00:00:00.000Z'
}
```

## toNumberPreprocessor

The `toNumberPreprocessor` will attempt to convert values to numbers.

```typescript
import { z } from 'zod'

const schema = z.object({
    age: z.preprocess(toNumberPreprocessor, z.number()),
    isActive: z.preprocess(toNumberPreprocessor, z.number()),
})

const input = {
    age: '44',
    isActive: true,
}

const result = schema.parse(input)

// `result` will now contain the following values
{
    age: 44,
    isActive: 1
}
```

## toBooleanPreprocessor

The `toBooleanPreprocessor` will attempt to convert values to booleans.

```typescript
import { z } from 'zod'

const schema = z.object({
    isActive: z.preprocess(toBooleanPreprocessor, z.boolean()),
    isConfirmed: z.preprocess(toBooleanPreprocessor, z.boolean()),
})

const input = {
    isActive: 'true',
    isConfirmed: 0,
}

const result = schema.parse(input)

// `result` will now contain the following values
{
    isActive: true,
    isConfirmed: false
}
```

## toArrayPreprocessor

The `toArrayPreprocessor` function will wrap primitive values in an array.

```typescript
import { z } from 'zod'

const schema = z.object({
    name: z.preprocess(toArrayPreprocessor, z.array(z.string())),
    age: z.preprocess(toArrayPreprocessor, z.array(z.number())),
})

const input = {
    name: 'John',
    age: 44,
}

const result = schema.parse(input)

// `result` will now contain the following values
{
    name: ['John'],
    age: [44]
}
```

## toDatePreprocessor

The `toDatePreprocessor` will attempt to convert values to date.

```typescript
import { z } from 'zod'

const schema = z.object({
    createdAt: z.preprocess(toDatePreprocessor, z.date()),
    updatedAt: z.preprocess(toDatePreprocessor, z.date()),
    deletedAt: z.preprocess(toDatePreprocessor, z.date()),
})

const input = {
    createdAt: 166,
    updatedAt: '2022-01-12T00:00:00.000Z',
    deletedAt: '2023-01-01',
}

const result = schema.parse(input)

// `result` will now contain the following values
{
    createdAt: new Date(166),
    updatedAt: new Date('2022-01-12T00:00:00.000Z'),
    deletedAt: new Date('2023-01-01'),
}
```
