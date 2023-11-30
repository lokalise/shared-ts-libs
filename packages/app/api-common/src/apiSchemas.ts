import z from 'zod'

export const PAGINATION_CONFIG_SCHEMA = z.object({
	limit: z.number().gt(0).optional(),
	before: z.string().min(1).optional(),
	after: z.string().min(1).optional(),
})
export type PaginationParams = z.infer<typeof PAGINATION_CONFIG_SCHEMA>

export const MANDATORY_PAGINATION_CONFIG_SCHEMA = PAGINATION_CONFIG_SCHEMA.extend({
	limit: z.number().gt(0)
})
export type MandatoryPaginationParams = z.infer<typeof MANDATORY_PAGINATION_CONFIG_SCHEMA>

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
