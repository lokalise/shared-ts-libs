import z from 'zod'
import type { RefinementCtx } from 'zod'

import { decodeCursor } from './cursorCodec.js'

export const MANDATORY_PAGINATION_CONFIG_SCHEMA = z.object({
  limit: z.coerce.number().gt(0),
  before: z.string().min(1).optional(),
  after: z.string().min(1).optional(),
})
export type MandatoryPaginationParams = z.infer<typeof MANDATORY_PAGINATION_CONFIG_SCHEMA>

export const OPTIONAL_PAGINATION_CONFIG_SCHEMA = MANDATORY_PAGINATION_CONFIG_SCHEMA.partial({
  limit: true,
})
export type OptionalPaginationParams = z.infer<typeof OPTIONAL_PAGINATION_CONFIG_SCHEMA>

const decodeCursorHook = (value: string | undefined, ctx: RefinementCtx) => {
  if (!value) {
    return undefined
  }

  const result = decodeCursor(value)
  if (result.result) {
    return result.result
  }
  ctx.addIssue({
    message: 'Invalid cursor',
    code: z.ZodIssueCode.custom,
    params: { message: result.error.message },
  })
}

export const multiCursorMandatoryPaginationSchema = <CursorType extends z.ZodSchema>(
  cursorType: CursorType,
) => {
  const cursor = z.string().transform(decodeCursorHook).pipe(cursorType.optional()).optional()
  return z.object({
    limit: z.coerce.number().gt(0),
    before: cursor,
    after: cursor,
  })
}
export const multiCursorOptionalPaginationSchema = <CursorType extends z.ZodSchema>(
  cursorType: CursorType,
) => multiCursorMandatoryPaginationSchema(cursorType).partial({ limit: true })

export const zMeta = z.object({
  count: z.number(),
  cursor: z.string().optional().describe('Pagination cursor, a last item id from this result set'),
  hasMore: z.boolean().optional().describe('Whether there are more items to fetch'),
})

export type PaginationMeta = z.infer<typeof zMeta>

export const paginatedResponseSchema = <T extends z.ZodSchema>(dataSchema: T) =>
  z.object({
    data: z.array(dataSchema),
    meta: zMeta,
  })
export type PaginatedResponse<T extends Record<string, unknown>> = {
  data: T[]
  meta: PaginationMeta
}

export const COMMON_ERROR_RESPONSE_SCHEMA = z.object({
  message: z.string(),
  errorCode: z.string(),
  details: z.any().optional(),
})

export type CommonErrorResponse = z.infer<typeof COMMON_ERROR_RESPONSE_SCHEMA>
