import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import toArrayPreprocessor from './toArrayPreprocessor'

describe('toArrayPreprocessor', () => {
  it('wraps strings in array', () => {
    const SCHEMA = z.object({
      names: z.preprocess(toArrayPreprocessor, z.array(z.string())),
    })

    const result = SCHEMA.parse({
      names: 'John',
    })

    expect(result).toEqual({
      names: ['John'],
    })
  })

  it('wraps numbers in array', () => {
    const SCHEMA = z.object({
      ages: z.preprocess(toArrayPreprocessor, z.array(z.number())),
    })

    const result = SCHEMA.parse({
      ages: 44,
    })

    expect(result).toEqual({
      ages: [44],
    })
  })

  it('wraps bigint in array', () => {
    const SCHEMA = z.object({
      ages: z.preprocess(toArrayPreprocessor, z.array(z.bigint())),
    })

    const result = SCHEMA.parse({
      ages: 44n,
    })

    expect(result).toEqual({
      ages: [44n],
    })
  })

  it('wraps booleans in array', () => {
    const SCHEMA = z.object({
      approvals: z.preprocess(toArrayPreprocessor, z.array(z.boolean())),
      actives: z.preprocess(toArrayPreprocessor, z.array(z.boolean())),
    })

    const result = SCHEMA.parse({
      approvals: true,
      actives: false,
    })

    expect(result).toEqual({
      approvals: [true],
      actives: [false],
    })
  })

  it('does not convert array input', () => {
    const SCHEMA = z.object({
      names: z.preprocess(toArrayPreprocessor, z.array(z.string())),
      ages: z.preprocess(toArrayPreprocessor, z.array(z.number())),
      actives: z.preprocess(toArrayPreprocessor, z.array(z.boolean())),
    })

    const result = SCHEMA.parse({
      names: ['John'],
      ages: [44],
      actives: [false],
    })

    expect(result).toEqual({
      names: ['John'],
      ages: [44],
      actives: [false],
    })
  })

  it('does not convert object input', () => {
    const SCHEMA = z.object({
      payload: z.preprocess(toArrayPreprocessor, z.array(z.any())),
    })

    expect(() =>
      SCHEMA.parse({
        payload: { foo: 'bar' },
      }),
    ).toThrow(/Expected array, received object/)
  })

  it('does not convert date input', () => {
    const SCHEMA = z.object({
      createdAt: z.preprocess(toArrayPreprocessor, z.array(z.any())),
    })

    expect(() =>
      SCHEMA.parse({
        createdAt: new Date(),
      }),
    ).toThrow(/Expected array, received date/)
  })

  it('does not convert undefined input', () => {
    const SCHEMA = z.object({
      createdAt: z.preprocess(toArrayPreprocessor, z.optional(z.boolean())),
    })

    const result = SCHEMA.parse({
      createdAt: undefined,
    })

    expect(result).toEqual({
      createdAt: undefined,
    })
  })

  it('does not convert null input', () => {
    const SCHEMA = z.object({
      createdAt: z.preprocess(toArrayPreprocessor, z.array(z.any())),
    })

    expect(() =>
      SCHEMA.parse({
        createdAt: null,
      }),
    ).toThrow(/Expected array, received null/)
  })

  it('does not convert function input', () => {
    const SCHEMA = z.object({
      name: z.preprocess(toArrayPreprocessor, z.array(z.any())),
    })

    expect(() =>
      SCHEMA.parse({
        name: (x: string) => x,
      }),
    ).toThrow(/Expected array, received function/)
  })
})
