import { describe, expect, it } from 'vitest'
import { z } from 'zod/v4'

import { toStringPreprocessor } from './toStringPreprocessor.ts'

describe('toStringPreprocessor', () => {
  it('converts numbers to string', () => {
    const SCHEMA = z.object({
      age: z.preprocess(toStringPreprocessor, z.string().max(15)),
      salary: z.preprocess(toStringPreprocessor, z.string()),
      atomsCount: z.preprocess(toStringPreprocessor, z.string()),
    })

    const result = SCHEMA.parse({
      age: 44,
      salary: 12.34,
      atomsCount: 35n,
    })

    expect(result).toEqual({
      age: '44',
      salary: '12.34',
      atomsCount: '35',
    })
  })

  it('converts booleans to string', () => {
    const SCHEMA = z.object({
      isAdmin: z.preprocess(toStringPreprocessor, z.string()),
      isActive: z.preprocess(toStringPreprocessor, z.string()),
    })

    const result = SCHEMA.parse({
      isAdmin: false,
      isActive: true,
    })

    expect(result).toEqual({
      isAdmin: 'false',
      isActive: 'true',
    })
  })

  it('converts dates to string', () => {
    const SCHEMA = z.object({
      createdAt: z.preprocess(toStringPreprocessor, z.string()),
    })

    const result = SCHEMA.parse({
      createdAt: new Date('2022-01-01'),
    })

    expect(result).toEqual({
      createdAt: '2022-01-01T00:00:00.000Z',
    })
  })

  it('accepts string input', () => {
    const SCHEMA = z.object({
      name: z.preprocess(toStringPreprocessor, z.string()),
    })

    const result = SCHEMA.parse({
      name: 'Batman',
    })

    expect(result).toEqual({
      name: 'Batman',
    })
  })

  it('converts null to empty string', () => {
    const SCHEMA = z.object({
      payload: z.preprocess(toStringPreprocessor, z.string()),
    })

    const result = SCHEMA.parse({
      payload: null,
    })

    expect(result).toEqual({
      payload: '',
    })
  })

  it('accepts undefined input', () => {
    const SCHEMA = z.object({
      name: z.preprocess(toStringPreprocessor, z.optional(z.string())),
    })

    const result = SCHEMA.parse({
      name: undefined,
    })

    expect(result).toEqual({
      name: undefined,
    })
  })

  it('fails when parsing unsupported types', () => {
    const SCHEMA = z.object({
      name: z.preprocess(toStringPreprocessor, z.optional(z.string())),
    })

    expect(() =>
      SCHEMA.parse({
        name: (x: string) => x,
      }),
    ).toThrowErrorMatchingInlineSnapshot(`
      [ZodError: [
        {
          "expected": "string",
          "code": "invalid_type",
          "path": [
            "name"
          ],
          "message": "Invalid input: expected string, received function"
        }
      ]]
    `)
  })

  it('fails when parsing objects', () => {
    const SCHEMA = z.object({
      payload: z.preprocess(toStringPreprocessor, z.string()),
    })

    expect(() =>
      SCHEMA.parse({
        payload: { foo: 'bar' },
      }),
    ).toThrowErrorMatchingInlineSnapshot(`
      [ZodError: [
        {
          "expected": "string",
          "code": "invalid_type",
          "path": [
            "payload"
          ],
          "message": "Invalid input: expected string, received object"
        }
      ]]
    `)
  })
})
