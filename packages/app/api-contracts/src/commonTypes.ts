import type { ZodType, z } from 'zod/v4'

export type InferSchemaInput<T extends ZodType | undefined> = T extends ZodType
  ? z.input<T>
  : T extends undefined
    ? undefined
    : never

export type InferSchemaOutput<T extends ZodType | undefined> = T extends ZodType
  ? z.infer<T>
  : T extends undefined
    ? undefined
    : never

/**
 * Resolves a contract's request path from its path params. The result must start with `/`.
 */
export type RoutePathResolver<PathParams> = (pathParams: PathParams) => `/${string}`

export interface CommonRouteDefinitionMetadata extends Record<string, unknown> {}

/**
 * Who a route is intended for.
 *
 * 'internal' marks routes (e.g. backend-for-frontend endpoints) that must not be part of
 * the published API surface: OpenAPI generators exclude them from the generated document.
 * It has no effect on runtime behavior — the route is registered and served as usual.
 */
export type RouteVisibility = 'public' | 'internal'
