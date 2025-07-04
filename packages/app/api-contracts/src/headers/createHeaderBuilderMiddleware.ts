import { HeaderBuilder, type Headers } from './headerBuilder.js'

/**
 * A helper function that creates a HeaderBuilderMiddleware, it removed the
 * complexity of creating a new instance of the middleware class and tracking the input types.
 *
 * @param middleware - A function that modifies a HeaderBuilder
 * @returns - A new instance of HeaderBuilderMiddleware to be used with a HeaderBuilder
 */
export function createHeaderBuilderMiddleware<const H extends Headers>(
    middleware: (builder: HeaderBuilder) => HeaderBuilder<H> | Promise<HeaderBuilder<H>>,
) {
    return new HeaderBuilderMiddleware<H>(middleware)
}

// There is no need to have access to the implementation of the HeaderBuilderMiddleware class
// all users should use the createHeaderBuilderMiddleware function to create a new instance,
// but I have to export the type for reference outside the file
export type { HeaderBuilderMiddleware }

type MiddlewareFn<H extends Headers> = (
    builder: HeaderBuilder<Headers>,
) => HeaderBuilder<H> | Promise<HeaderBuilder<H>>

/**
 * A middleware class that allows you to modify a HeaderBuilder in a type-safe way.
 * It receives a builder and returns a new builder with the modifications applied.
 *
 * @example
 * ```typescript
 * const authMiddleware = createHeaderBuilderMiddleware(async (builder) => {
 *   const token = await fetchToken()
 *   return builder.add('authorization', `Bearer ${token}`)
 * })
 *
 *  const builder = HeaderBuilder.create()
 *  .with(authMiddleware)
 *
 *  const headers = await builder.resolve() // Type of headers is { 'authorization': string }
 *  console.log(headers) // { 'authorization': 'Bearer <token>' }
 */
class HeaderBuilderMiddleware<const H extends Headers> {
    private readonly middleware: MiddlewareFn<H>

    constructor(middleware: MiddlewareFn<H>) {
        this.middleware = middleware
    }

    apply<const BH extends Headers>(base: HeaderBuilder<BH>): HeaderBuilder<BH & H> {
        // Using the `from` method to make the promise lazy - it should only resolve when the builder is resolved
        return base.from(async () => {
            const middlewareBuilder = this.middleware(HeaderBuilder.create())

            return middlewareBuilder instanceof Promise
                ? middlewareBuilder.then((r) => r.resolve())
                : middlewareBuilder.resolve()
        })
    }
}
