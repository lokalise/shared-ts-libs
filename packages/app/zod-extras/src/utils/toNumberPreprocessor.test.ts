import { describe, expect, it } from 'vitest'
import { z } from 'zod/v4'
import { toNumberPreprocessor } from './toNumberPreprocessor.ts'

describe('toNumberPreprocessor', () => {
  it('converts strings to number', () => {
    const SCHEMA = z.object({
      age: z.preprocess(toNumberPreprocessor, z.number()),
      gold: z.preprocess(toNumberPreprocessor, z.number()),
      level: z.preprocess(toNumberPreprocessor, z.number()),
    })

    const result = SCHEMA.parse({
      age: '44',
      gold: '12.34',
      level: '2e3',
    })

    expect(result).toEqual({
      age: 44,
      gold: 12.34,
      level: 2000,
    })
  })

  it('converts booleans to number', () => {
    const SCHEMA = z.object({
      isActive: z.preprocess(toNumberPreprocessor, z.number()),
      isConfirmed: z.preprocess(toNumberPreprocessor, z.number()),
    })

    const result = SCHEMA.parse({
      isActive: true,
      isConfirmed: false,
    })

    expect(result).toEqual({
      isActive: 1,
      isConfirmed: 0,
    })
  })

  it('converts null to zero', () => {
    const SCHEMA = z.object({
      createdAt: z.preprocess(toNumberPreprocessor, z.number()),
    })

    const result = SCHEMA.parse({
      createdAt: null,
    })

    expect(result).toEqual({
      createdAt: 0,
    })
  })

  it('does not convert empty string', () => {
    const SCHEMA = z.object({
      createdAt: z.preprocess(toNumberPreprocessor, z.number()),
    })

    expect(() =>
      SCHEMA.parse({
        createdAt: '',
      }),
    ).toThrowErrorMatchingInlineSnapshot(`
      [ZodError: [
        {
          "expected": "number",
          "code": "invalid_type",
          "path": [
            "createdAt"
          ],
          "message": "Invalid input: expected number, received string"
        }
      ]]
    `)
  })

  it('does not convert numbers input', () => {
    const SCHEMA = z.object({
      age: z.preprocess(toNumberPreprocessor, z.number()),
      gold: z.preprocess(toNumberPreprocessor, z.number()),
      level: z.preprocess(toNumberPreprocessor, z.number()),
    })

    const result = SCHEMA.parse({
      age: 44,
      gold: 12.34,
      level: 2e3,
    })

    expect(result).toEqual({
      age: 44,
      gold: 12.34,
      level: 2e3,
    })
  })

  it('does not convert bigint input', () => {
    const SCHEMA = z.object({
      age: z.preprocess(toNumberPreprocessor, z.number()),
    })

    expect(() =>
      SCHEMA.parse({
        age: 44n,
      }),
    ).toThrowErrorMatchingInlineSnapshot(`
      [ZodError: [
        {
          "expected": "number",
          "code": "invalid_type",
          "path": [
            "age"
          ],
          "message": "Invalid input: expected number, received bigint"
        }
      ]]
    `)
  })

  it('does not convert object input', () => {
    const SCHEMA = z.object({
      payload: z.preprocess(toNumberPreprocessor, z.number()),
    })

    expect(() =>
      SCHEMA.parse({
        payload: { foo: 'bar' },
      }),
    ).toThrowErrorMatchingInlineSnapshot(`
      [ZodError: [
        {
          "expected": "number",
          "code": "invalid_type",
          "path": [
            "payload"
          ],
          "message": "Invalid input: expected number, received object"
        }
      ]]
    `)
  })

  it('does not convert date input', () => {
    const SCHEMA = z.object({
      createdAt: z.preprocess(toNumberPreprocessor, z.number()),
    })

    expect(() =>
      SCHEMA.parse({
        createdAt: new Date(),
      }),
    ).toThrowErrorMatchingInlineSnapshot(`
      [ZodError: [
        {
          "expected": "number",
          "code": "invalid_type",
          "path": [
            "createdAt"
          ],
          "message": "Invalid input: expected number, received Date"
        }
      ]]
    `)
  })

  it('does not convert undefined input', () => {
    const SCHEMA = z.object({
      createdAt: z.preprocess(toNumberPreprocessor, z.optional(z.number())),
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
      name: z.preprocess(toNumberPreprocessor, z.number()),
    })

    expect(() =>
      SCHEMA.parse({
        name: (x: string) => x,
      }),
    ).toThrowErrorMatchingInlineSnapshot(`
      [ZodError: [
        {
          "expected": "number",
          "code": "invalid_type",
          "path": [
            "name"
          ],
          "message": "Invalid input: expected number, received function"
        }
      ]]
    `)
  })

  it('does not convert string which are not valid numbers', () => {
    const SCHEMA = z.object({
      age: z.preprocess(toNumberPreprocessor, z.number()),
    })

    expect(() =>
      SCHEMA.parse({
        age: '123abc',
      }),
    ).toThrowErrorMatchingInlineSnapshot(`
      [ZodError: [
        {
          "expected": "number",
          "code": "invalid_type",
          "path": [
            "age"
          ],
          "message": "Invalid input: expected number, received string"
        }
      ]]
    `)
  })
})
