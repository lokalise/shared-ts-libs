import { describe, expect, it } from 'vitest'
import { z, ZodError } from 'zod'

import {
	BASE_MULTI_CURSOR_SCHEMA,
	multiCursorMandatoryPaginationSchema,
	multiCursorOptionalPaginationSchema,
} from '../src'
import { encode } from '../src/stringCoder'

describe('apiSchemas', () => {
	describe('multi cursor pagination schemas', () => {
		const uuid = '00000000-0000-0000-0000-000000000000'
		const cursorSchema = BASE_MULTI_CURSOR_SCHEMA.extend({
			name: z.string(),
		})
		type cursorType = z.infer<typeof cursorSchema>

		describe('multiCursorMandatoryPaginationSchema', () => {
			const schema = multiCursorMandatoryPaginationSchema(cursorSchema)
			type schemaType = z.infer<typeof schema>
			type schemaTypeInput = z.infer<typeof schema>

			it('should parse object and return correct type', () => {
				const object: schemaTypeInput = {
					limit: 1,
					before: encode(JSON.stringify({ id: uuid, name: 'apple' })),
				}

				const result: schemaType = schema.parse(object)
				expect(result).toEqual({
					limit: 1,
					before: { id: uuid, name: 'apple' },
				} satisfies schemaType)
			})

			it('wrong cursor type should produce error', () => {
				const schema = multiCursorMandatoryPaginationSchema(cursorSchema)
				let error: ZodError | undefined
				try {
					schema.parse({
						limit: 10,
						after: {},
					})
				} catch (e) {
					error = e instanceof ZodError ? e : undefined
				}
				expect(error).toBeDefined()
				expect(error).toMatchObject({
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
				let error: ZodError | undefined
				try {
					schema.parse({
						limit: 10,
						after: encode('heyo'),
					})
				} catch (e) {
					error = e instanceof ZodError ? e : undefined
				}
				expect(error).toBeDefined()
				expect(error).toMatchObject({
					issues: [
						{
							message: 'Invalid cursor',
							code: 'custom',
							params: { message: 'Unexpected token \'h\', "heyo" is not valid JSON' },
							path: ['after'],
						},
					],
					name: 'ZodError',
				})
			})

			it('wrong cursor object should produce error', () => {
				const schema = multiCursorMandatoryPaginationSchema(cursorSchema)
				let error: ZodError | undefined
				try {
					schema.parse({
						limit: 10,
						after: encode(
							JSON.stringify({
								id: '1',
								name: 'apple',
							} satisfies cursorType),
						),
					})
				} catch (e) {
					console.log(JSON.stringify(e))
					error = e instanceof ZodError ? e : undefined
				}
				expect(error).toBeDefined()
				expect(error).toMatchObject({
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
			type schemaTypeInput = z.infer<typeof schema>

			it('limit is optional', () => {
				const object: schemaTypeInput = {
					before: encode(JSON.stringify({ id: uuid, name: 'apple' })),
				}

				const result: schemaType = schema.parse(object)
				expect(result).toEqual({
					before: { id: uuid, name: 'apple' },
				} satisfies schemaType)
			})
		})
	})
})
