import type { HeaderBuilderMiddleware } from './createHeaderBuilderMiddleware.js'

export type Headers<K extends string = string, V extends string = string> = Record<K, V>

// biome-ignore lint/complexity/noBannedTypes: To represent no headers we need use an empty object
export type NoHeaders = {}

export type HeadersFromBuilder<H extends HeaderBuilder> = H extends HeaderBuilder<infer T>
    ? T
    : never

type Factories = (() => Promise<Headers> | Headers)[]

/**
 * A builder class that helps to build up a set of headers in a type-safe way.
 * It allows you to add headers, merge them together, and resolve them into a single object.
 * The builder is immutable, so every operation returns a new instance of the builder.
 * It offers a middleware function that allows you to modify the builder, asynchronously, in a type-safe way.
 *
 * @example
 * ```typescript
 * const authMiddleware = createHeaderBuilderMiddleware(async (builder) => {
 *    const token = await fetchToken()
 *    return builder.add('authorization', `Bearer ${token}`)
 * })
 *
 * const builder = HeaderBuilder.create()
 *    .add('Content-Type', 'application/json')
 *    .and({ 'X-Custom-Header': 'custom', 'X-Another-Header': 'another' })
 *    .with(authMiddleware)
 *
 * const headers = await builder.resolve()
 * console.log(headers)
 * // Prints: {
 * //    'Content-Type': 'application/json',
 * //    'X-Custom-Header': 'custom',
 * //    'X-Another-Header': 'another',
 * //    'authorization': 'Bearer <token>'
 * // }
 */
export class HeaderBuilder<H extends Headers = NoHeaders> {
    /**
     * Creates a new HeaderBuilder, optionally with an initial set of headers.
     *
     * @example
     * ```typescript
     * const builder = HeaderBuilder.create()
     *
     * const builderWithHeaders = HeaderBuilder.create({ 'Content-Type': 'application/json' })
     *
     * console.log(builder) // {}
     * console.log(builderWithHeaders) // { 'Content-Type': 'application/json' }
     * ```
     */
    static create<const H extends Headers = NoHeaders>(): HeaderBuilder<H>
    static create<const H extends Headers>(initialHeaders: H | (() => H) | (() => Promise<H>)): HeaderBuilder<H>
    static create<const H extends Headers>(initialHeaders = {} as H): HeaderBuilder<H> {
        return new HeaderBuilder([() => initialHeaders])
    }

    // This is a list of headers that will be put together in the resolve method.
    // You can think of this as building up a history of added headers that will be
    // merged together when they are needed.
    private readonly factories: Factories

    /**
     * This constructor is private to prevent the creation of a HeaderBuilder, it's an implementation detail
     * that users of this class should not be aware of. The only way to create a HeaderBuilder is through the
     * static create method.
     *
     * @private
     */
    private constructor(factories: Factories) {
        this.factories = factories
    }

    /**
     * Adds a single header to the builder by providing a key and a value.
     *
     * @example
     * ```typescript
     * const builder = HeaderBuilder.create()
     *     .add('Content-Type', 'application/json')
     *     .add('authorization', 'Bearer token')
     *
     *  const headers = await builder.resolve()
     *  console.log(headers)
     *  // { 'Content-Type': 'application/json', 'authorization': 'Bearer token' }
     * ```
     *
     * @param key - The key of the header
     * @param value - The value of the header
     */
    add<const K extends string, const V>(key: K, value: V): HeaderBuilder<H & { [k in K]: V }> {
        return new HeaderBuilder([...this.factories, () => ({ [key]: value }) as Headers])
    }

    /**
     * Adds multiple headers to the builder by providing an object or a promise of an object with the headers.
     *
     * @example
     * ```typescript
     * const builder = HeaderBuilder.create()
     *    .and({ 'Content-Type': 'application/json', 'authorization': 'Bearer token' })
     *    .and(Promise.resolve({ 'X-Custom-Header': 'custom', 'X-Another-Header': 'another' }))
     *
     * const headers = await builder.resolve()
     * console.log(headers)
     * // Prints: {
     * //   'Content-Type': 'application/json',
     * //   'authorization': 'Bearer token',
     * //   'X-Custom-Header': 'custom',
     * //   'X-Another-Header': 'another'
     * // }
     * ```
     *
     * @param extension - An object with the headers to add
     */
    and<const K extends string, const V extends string, E extends Headers<K, V>>(
        extension: E | Promise<E>,
    ): HeaderBuilder<H & E> {
        return new HeaderBuilder([...this.factories, () => extension])
    }

    /**
     * Adds a factory function that returns a promise of headers to the builder.
     * This is useful when you need to fetch some data asynchronously to build the headers.
     *
     * @example
     * ```typescript
     * const builder = HeaderBuilder.create()
     *    .from(async () => {
     *       const token = await fetchToken()
     *       return { 'authorization': `Bearer ${token}` }
     *    })
     *
     * const headers = await builder.resolve()
     * console.log(headers) // { 'authorization': 'Bearer <token>' }
     * ```
     *
     * @param factory - A function that returns a promise of headers
     */
    from<E extends Headers>(factory: () => E | Promise<E>): HeaderBuilder<H & E> {
        return new HeaderBuilder([...this.factories, factory])
    }

    /**
     * Takes a middleware function that receives the current builder and returns a new, modified, builder.
     *
     * @example
     * ```typescript
     * const authMiddleware = createHeaderBuilderMiddleware(async (builder) => {
     *   const token = await fetchToken()
     *   return builder.add('authorization', `Bearer ${token}`)
     * })
     *
     * const builder = HeaderBuilder.create()
     *   .with(authMiddleware)
     *
     * const headers = await builder.resolve() // Type of headers is { 'authorization': string }
     * console.log(headers) // { 'authorization': 'Bearer <token>' }
     * ```
     *
     * @param middleware
     */
    with<const T extends Headers>(middleware: HeaderBuilderMiddleware<T>) {
        return middleware.apply(this)
    }

    /**
     * Merges the current builder with another builder.
     *
     * @example
     * ```typescript
     * const builderA = HeaderBuilder.create()
     *    .add('Content-Type', 'application/json')
     *
     * const builderB = HeaderBuilder.create()
     *    .add('authorization', 'Bearer token')
     *
     * const mergedBuilder = builderA.merge(builderB)
     *
     * const headers = await mergedBuilder.resolve()
     * console.log(headers)
     * // { 'Content-Type': 'application/json', 'authorization': 'Bearer token' }
     * ```
     *
     * @param builder - The builder to merge with
     */
    merge<const T extends Headers>(builder: HeaderBuilder<T>): HeaderBuilder<H & T> {
        return new HeaderBuilder([...this.factories, ...builder.factories])
    }

    /**
     * Resolves the headers by waiting for all the promises to resolve and merging them together.
     *
     * @example
     * ```typescript
     * const builder = HeaderBuilder.create()
     *    .add('Content-Type', 'application/json')
     *
     * const headers = await builder.resolve()
     * console.log(headers) // { 'Content-Type': 'application/json' }
     */
    async resolve(): Promise<H> {
        const headers = this.factories.map((header) => header())
        const resolvedHeaders = await Promise.all(headers)

        return Object.assign({}, ...resolvedHeaders)
    }
}
