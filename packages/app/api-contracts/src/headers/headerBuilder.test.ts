import { createHeaderBuilderMiddleware } from './createHeaderBuilderMiddleware.js'
import { HeaderBuilder } from './headerBuilder.js'
import { describe, expect, vitest } from 'vitest'

// biome-ignore lint/complexity/noBannedTypes: To test empty headers, we need to use an empty object type.
type ExpectedEmptyHeaders = {}

// It is critical that type safety is maintained when refactoring - this offers a way to unit test the type-system.
// The call will fail to build if the expected type is not correct.
const typeCheck = <const Expected>(_actual: Expected): void => {}

describe('HeaderBuilder', () => {
	it('should create an empty header builder', async () => {
		const builder = HeaderBuilder.create()

		const actual = await builder.resolve()

		typeCheck<ExpectedEmptyHeaders>(actual)

		expect(actual).toEqual({})
	})

	it('should create a header builder with default headers', async () => {
		const builder = HeaderBuilder.create({ 'Content-Type': 'application/json' })

		const actual = await builder.resolve()

		typeCheck<{ 'Content-Type': 'application/json' }>(actual)

		expect(actual).toEqual({ 'Content-Type': 'application/json' })
	})

	it('should allow individual headers to be added to the builder by name', async () => {
		const builder = HeaderBuilder.create().add('Content-Type', 'application/json')

		const actual = await builder.resolve()

		typeCheck<{ 'Content-Type': 'application/json' }>(actual)

		expect(actual).toEqual({ 'Content-Type': 'application/json' })
	})

	it('should allow multiple headers to be added in one static object', async () => {
		const builder = HeaderBuilder.create().and({
			'Content-Type': 'application/json',
			'X-Api-Key': '1234',
		})

		const actual = await builder.resolve()

		typeCheck<{ 'Content-Type': 'application/json'; 'X-Api-Key': '1234' }>(actual)

		expect(actual).toEqual({ 'Content-Type': 'application/json', 'X-Api-Key': '1234' })
	})

	it('should allow multiple headers to be added in a promise of one static object', async () => {
		const builder = HeaderBuilder.create().and(
			Promise.resolve({
				'Content-Type': 'application/json',
				'X-Api-Key': '1234',
			}),
		)

		const actual = await builder.resolve()

		typeCheck<{ 'Content-Type': 'application/json'; 'X-Api-Key': '1234' }>(actual)

		expect(actual).toEqual({ 'Content-Type': 'application/json', 'X-Api-Key': '1234' })
	})

	it('should allow headers to be added from a factory function', async () => {
		const builder = HeaderBuilder.create().from(async () => {
			const token = await mockGetToken()
			return { authorization: `Bearer ${token}` }
		})

		const actual = await builder.resolve()

		typeCheck<{ authorization: string }>(actual)

		expect(actual).toEqual({ authorization: 'Bearer 1234' })
	})

	const mockGetToken = async () => '1234'

	it('should allow you to extend the builder with middleware functions', async () => {
		const middleware = createHeaderBuilderMiddleware(async (builder) => {
			const token = await mockGetToken()
			return builder.and({ authorization: `Bearer ${token}` })
		})

		const builder = HeaderBuilder.create().with(middleware)

		const actual = await builder.resolve()

		typeCheck<{ authorization: string }>(actual)

		expect(actual).toEqual({ authorization: 'Bearer 1234' })
	})

	it('should lazy load promises and only resolve them when the headers are resolved', async () => {
		const factory = vitest.fn(async () => ({ 'Content-Type': 'application/json' }) as const)
		const middlewareMock = vitest.fn(async (builder: HeaderBuilder) =>
			builder.add('X-Api-Key', '1234'),
		)

		const middleware = createHeaderBuilderMiddleware(middlewareMock)

		const builder = HeaderBuilder.create().from(factory).with(middleware)

		expect(factory).not.toHaveBeenCalled()
		expect(middlewareMock).not.toHaveBeenCalled()

		const actual = await builder.resolve()

		typeCheck<{ 'Content-Type': 'application/json'; 'X-Api-Key': '1234' }>(actual)

		expect(factory).toHaveBeenCalled()
		expect(actual).toEqual({ 'Content-Type': 'application/json', 'X-Api-Key': '1234' })
	})

	it('should merge two header builders', async () => {
		const builder1 = HeaderBuilder.create().add('Content-Type', 'application/json')
		const builder2 = HeaderBuilder.create().add('authorization', 'Bearer token')

		const mergedBuilder = builder1.merge(builder2)

		const actual = await mergedBuilder.resolve()

		typeCheck<{ 'Content-Type': 'application/json'; authorization: 'Bearer token' }>(actual)

		expect(actual).toEqual({ 'Content-Type': 'application/json', authorization: 'Bearer token' })
	})
})
