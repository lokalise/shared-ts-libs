import { createHeaderBuilderMiddleware } from './createHeaderBuilderMiddleware.js'
import { HeaderBuilder } from './headerBuilder.js'
import { describe, expect, it } from 'vitest'

describe('createHeaderBuilderMiddleware', () => {
	it('should create a middleware that adds a header', async () => {
		const middleware = createHeaderBuilderMiddleware((builder) =>
			builder.add('X-Test-Header', 'test-value'),
		)

		const builder = HeaderBuilder.create().with(middleware)
		const actual = await builder.resolve()

		expect(actual).toEqual({ 'X-Test-Header': 'test-value' })
	})

	it('should create a middleware that adds multiple headers', async () => {
		const middleware = createHeaderBuilderMiddleware((builder) =>
			builder.and({
				'X-Test-Header-1': 'value1',
				'X-Test-Header-2': 'value2',
			}),
		)

		const builder = HeaderBuilder.create().with(middleware)
		const actual = await builder.resolve()

		expect(actual).toEqual({
			'X-Test-Header-1': 'value1',
			'X-Test-Header-2': 'value2',
		})
	})

	it('should create a middleware that adds headers asynchronously', async () => {
		const middleware = createHeaderBuilderMiddleware(async (builder) => {
			const token = await new Promise<string>((resolve) => resolve('async-token'))
			return builder.add('authorization', `Bearer ${token}`)
		})

		const builder = HeaderBuilder.create().with(middleware)
		const actual = await builder.resolve()

		expect(actual).toEqual({ authorization: 'Bearer async-token' })
	})

	it('should create a middleware that merges headers from another builder', async () => {
		const otherBuilder = HeaderBuilder.create().add('X-Other-Header', 'other-value')
		const middleware = createHeaderBuilderMiddleware((builder) => builder.merge(otherBuilder))

		const builder = HeaderBuilder.create().with(middleware)
		const actual = await builder.resolve()

		expect(actual).toEqual({ 'X-Other-Header': 'other-value' })
	})

	it('should handle middleware that returns a promise of a builder', async () => {
		const middleware = createHeaderBuilderMiddleware((builder) =>
			Promise.resolve(builder.add('X-Promise-Header', 'promise-value')),
		)

		const builder = HeaderBuilder.create().with(middleware)
		const actual = await builder.resolve()

		expect(actual).toEqual({ 'X-Promise-Header': 'promise-value' })
	})
})
