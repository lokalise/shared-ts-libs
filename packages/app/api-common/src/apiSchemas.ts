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

const page = z.object({
	limit: z.number(),
	hasMore: z.boolean(),
	startingAfter: z.string().optional().describe('First item id from this result set'),
	endingBefore: z.string().optional().describe('Last item id from this result set'),
	count: z.number(),
})

export const zMeta = z.object({
	statusUrl: z
		.string()
		.optional()
		.describe('URL to use for polling about asynchronous operation status'),
	page,
})

export type PaginationMeta = z.infer<typeof zMeta>

export const COMMON_ERROR_RESPONSE_SCHEMA = z.object({
	message: z.string(),
	errorCode: z.string(),
	details: z.any().optional(),
})

export type CommonErrorResponse = z.infer<typeof COMMON_ERROR_RESPONSE_SCHEMA>
