import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import toBooleanPreprocessor from './toBooleanPreprocessor'

describe('toBooleanPreprocessor', () => {
  it('converts valid strings to boolean', () => {
    const SCHEMA = z.object({
      isActive: z.preprocess(toBooleanPreprocessor, z.boolean()),
      isDeleted: z.preprocess(toBooleanPreprocessor, z.boolean()),
    })

    const result = SCHEMA.parse({
      isActive: 'true',
      isDeleted: 'false',
    })

    expect(result).toEqual({
      isActive: true,
      isDeleted: false,
    })
  })

  it('converts valid numbers to boolean', () => {
    const SCHEMA = z.object({
      isActive: z.preprocess(toBooleanPreprocessor, z.boolean()),
      isDeleted: z.preprocess(toBooleanPreprocessor, z.boolean()),
    })

    const result = SCHEMA.parse({
      isActive: 1,
      isDeleted: 0,
    })

    expect(result).toEqual({
      isActive: true,
      isDeleted: false,
    })
  })

  it('converts null to false', () => {
    const SCHEMA = z.object({
      isActive: z.preprocess(toBooleanPreprocessor, z.boolean()),
    })

    const result = SCHEMA.parse({
      isActive: null,
    })

    expect(result).toEqual({
      isActive: false,
    })
  })

  it('does not convert invalid strings to boolean', () => {
    const SCHEMA = z.object({
      foo: z.preprocess(toBooleanPreprocessor, z.boolean()),
    })

    expect(() =>
      SCHEMA.parse({
        foo: 'bar',
      }),
    ).toThrow(/Expected boolean, received string/)
  })

  it('does not convert invalid numbers to boolean', () => {
    const SCHEMA = z.object({
      isActive: z.preprocess(toBooleanPreprocessor, z.boolean()),
    })

    expect(() =>
      SCHEMA.parse({
        isActive: 123,
      }),
    ).toThrow(/Expected boolean, received number/)
  })

  it('does not convert boolean input', () => {
    const SCHEMA = z.object({
      isActive: z.preprocess(toBooleanPreprocessor, z.boolean()),
      isConfirmed: z.preprocess(toBooleanPreprocessor, z.boolean()),
    })

    const result = SCHEMA.parse({
      isActive: false,
      isConfirmed: true,
    })

    expect(result).toEqual({
      isActive: false,
      isConfirmed: true,
    })
  })

  it('does not convert object input', () => {
    const SCHEMA = z.object({
      payload: z.preprocess(toBooleanPreprocessor, z.boolean()),
    })

    expect(() =>
      SCHEMA.parse({
        payload: { foo: 'bar' },
      }),
    ).toThrow(/Expected boolean, received object/)
  })

  it('does not convert date input', () => {
    const SCHEMA = z.object({
      createdAt: z.preprocess(toBooleanPreprocessor, z.boolean()),
    })

    expect(() =>
      SCHEMA.parse({
        createdAt: new Date(),
      }),
    ).toThrow(/Expected boolean, received date/)
  })

  it('does not convert undefined input', () => {
    const SCHEMA = z.object({
      createdAt: z.preprocess(toBooleanPreprocessor, z.optional(z.boolean())),
    })

    const result = SCHEMA.parse({
      createdAt: undefined,
    })

    expect(result).toEqual({
      createdAt: undefined,
    })
  })

  it('does not convert function input', () => {
    const SCHEMA = z.object({
      name: z.preprocess(toBooleanPreprocessor, z.boolean()),
    })

    expect(() =>
      SCHEMA.parse({
        name: (x: string) => x,
      }),
    ).toThrow(/Expected boolean, received function/)
  })
})
