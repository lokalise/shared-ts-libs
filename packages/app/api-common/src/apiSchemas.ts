import z from 'zod'

export const OPTIONAL_PAGINATION_CONFIG_SCHEMA = z.object({
	limit: z.number().gt(0).optional(),
	before: z.string().min(1).optional(),
	after: z.string().min(1).optional(),
})
export type OptionalPaginationParams = z.infer<typeof OPTIONAL_PAGINATION_CONFIG_SCHEMA>

export const MANDATORY_PAGINATION_CONFIG_SCHEMA = OPTIONAL_PAGINATION_CONFIG_SCHEMA.extend({
	limit: z.number().gt(0),
})
export type MandatoryPaginationParams = z.infer<typeof MANDATORY_PAGINATION_CONFIG_SCHEMA>

/**
 * Offset pagination should be used when sorting by non-unique column
 */
export const OFFSET_PAGINATION_CONFIG_SCHEMA = z.object({
	skip: z.number().int().gt(0).optional(),
	limit: z.number().int().gt(0).optional(),
})
export type OffsetPaginationParams = z.infer<typeof OFFSET_PAGINATION_CONFIG_SCHEMA>

export const zMeta = z.object({
	count: z.number(),
	cursor: z.string().optional().describe('Pagination cursor, a last item id from this result set'),
})

export type PaginationMeta = z.infer<typeof zMeta>

export const COMMON_ERROR_RESPONSE_SCHEMA = z.object({
	message: z.string(),
	errorCode: z.string(),
	details: z.any().optional(),
})

export type CommonErrorResponse = z.infer<typeof COMMON_ERROR_RESPONSE_SCHEMA>
