import z from 'zod'
import type { RefinementCtx } from 'zod/lib/types'

import { decodeCursor } from './cursorCoder'

export const MANDATORY_PAGINATION_CONFIG_SCHEMA = z.object({
	limit: z.coerce.number().gt(0).gt(0),
	before: z.string().min(1).optional(),
	after: z.string().min(1).optional(),
})
export type MandatoryPaginationParams = z.infer<typeof MANDATORY_PAGINATION_CONFIG_SCHEMA>

export const OPTIONAL_PAGINATION_CONFIG_SCHEMA = MANDATORY_PAGINATION_CONFIG_SCHEMA.partial({
	limit: true,
})
export type OptionalPaginationParams = z.infer<typeof OPTIONAL_PAGINATION_CONFIG_SCHEMA>

const decodeCursorHook = (value: string, ctx: RefinementCtx) => {
	try {
		return decodeCursor(value)
	} catch (e) {
		ctx.addIssue({
			message: 'Invalid cursor',
			code: z.ZodIssueCode.custom,
			params: { message: e instanceof Error ? e.message : undefined },
		})
	}
}

export const BASE_MULTI_CURSOR_SCHEMA = z.object({
	id: z.string().uuid(),
})
type MultiCursorBaseType = z.infer<typeof BASE_MULTI_CURSOR_SCHEMA>
export const multiCursorMandatoryPaginationSchema = <
	CursorType extends z.ZodSchema<MultiCursorBaseType>,
>(
	cursorType: CursorType,
) => {
	const cursor = z.string().transform(decodeCursorHook).pipe(cursorType).optional()
	return z.object({
		limit: z.coerce.number().gt(0),
		before: cursor,
		after: cursor,
	})
}
export const multiCursorOptionalPaginationSchema = <
	CursorType extends z.ZodSchema<MultiCursorBaseType>,
>(
	cursorType: CursorType,
) => multiCursorMandatoryPaginationSchema(cursorType).partial({ limit: true })

/**
 * Offset pagination should be used when sorting by non-unique column
 * // TODO: remove?
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
