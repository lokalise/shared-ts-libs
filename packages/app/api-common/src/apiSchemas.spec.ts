import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
  multiCursorMandatoryPaginationSchema,
  multiCursorOptionalPaginationSchema,
  paginatedResponseSchema,
} from './apiSchemas.ts'
import { encodeCursor } from './cursorCodec.ts'

describe('apiSchemas', () => {
  describe('multi cursor pagination schemas', () => {
    const uuid = '00000000-0000-0000-0000-000000000000'
    const cursorSchema = z.object({
      id: z.string().uuid(),
      name: z.string(),
    })
    type cursorType = z.infer<typeof cursorSchema>

    describe('multiCursorMandatoryPaginationSchema', () => {
      const schema = multiCursorMandatoryPaginationSchema(cursorSchema)
      type schemaType = z.infer<typeof schema>
      type schemaTypeInput = z.input<typeof schema>

      it('should parse object and return correct type', () => {
        const object: schemaTypeInput = {
          limit: 1,
          before: encodeCursor({ id: uuid, name: 'apple' }),
        }

        const result: schemaType = schema.parse(object)
        expect(result).toEqual({
          limit: 1,
          before: { id: uuid, name: 'apple' },
        } satisfies schemaType)
      })

      it('should ignore undefined cursor', () => {
        const object: schemaTypeInput = {
          limit: 1,
          before: '',
        }

        const result: schemaType = schema.parse(object)
        expect(result).toEqual({
          limit: 1,
          before: undefined,
        } satisfies schemaType)
      })

      it('should ignore empty cursor', () => {
        const object: schemaTypeInput = {
          limit: 1,
          before: '',
        }

        const result: schemaType = schema.parse(object)
        expect(result).toEqual({
          limit: 1,
          before: undefined,
        } satisfies schemaType)
      })

      it('wrong cursor type should produce error', () => {
        const schema = multiCursorMandatoryPaginationSchema(cursorSchema)
        const result = schema.safeParse({ limit: 10, after: {} })
        expect(result.success).toBe(false)
        expect(result.error).toBeDefined()
        expect(result.error).toMatchObject({
          issues: [
            {
              code: 'invalid_type',
              expected: 'string',
              received: 'object',
              path: ['after'],
              message: 'Expected string, received object',
            },
          ],
          name: 'ZodError',
        })
      })

      it('wrong cursor string should produce error', () => {
        const schema = multiCursorMandatoryPaginationSchema(cursorSchema)
        const result = schema.safeParse({
          limit: 10,
          after: 'heyo',
        })
        expect(result.success).toBe(false)
        expect(result.error).toBeDefined()
        expect(result.error).toMatchObject({
          issues: [
            {
              message: 'Invalid cursor',
              code: 'custom',
              params: { message: expect.any(String) },
              path: ['after'],
            },
          ],
          name: 'ZodError',
        })
      })

      it('wrong cursor object should produce error', () => {
        const schema = multiCursorMandatoryPaginationSchema(cursorSchema)
        const result = schema.safeParse({
          limit: 10,
          after: encodeCursor({
            id: '1',
            name: 'apple',
          } satisfies cursorType),
        })
        expect(result.success).toBe(false)
        expect(result.error).toBeDefined()
        expect(result.error).toMatchObject({
          issues: [
            {
              validation: 'uuid',
              code: 'invalid_string',
              message: 'Invalid uuid',
              path: ['after', 'id'],
            },
          ],
          name: 'ZodError',
        })
      })
    })

    describe('multiCursorOptionalPaginationSchema', () => {
      const schema = multiCursorOptionalPaginationSchema(cursorSchema)
      type schemaType = z.infer<typeof schema>
      type schemaTypeInput = z.input<typeof schema>

      it('limit is optional', () => {
        const object: schemaTypeInput = {
          before: encodeCursor({ id: uuid, name: 'apple' }),
        }

        const result: schemaType = schema.parse(object)
        expect(result).toEqual({
          before: { id: uuid, name: 'apple' },
        } satisfies schemaType)
      })
    })

    describe('paginatedResponseSchema', () => {
      const objectSchema = z.object({
        id: z.string().min(1),
      })
      const pageSchema = paginatedResponseSchema(objectSchema)
      type pageType = z.infer<typeof pageSchema>

      it('validation success', () => {
        const page: pageType = {
          data: [{ id: '1' }],
          meta: {
            count: 1,
            cursor: '1',
            hasMore: false,
          },
        }
        const result = pageSchema.safeParse(page)
        expect(result.success).toBe(true)
      })
      it('validation error', () => {
        const page: pageType = {
          data: [{ fake: '1' }] as any,
          meta: {
            count: 1,
            cursor: '1',
            hasMore: false,
          },
        }
        const result = pageSchema.safeParse(page)
        expect(result.success).toBe(false)
      })
    })
  })
})
