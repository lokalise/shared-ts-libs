import { z, type ZodRawShape } from 'zod'

export const createObjectSchema = <T extends ZodRawShape>(eventSchema: T) => {
	return z.tuple([z.object(eventSchema)])
}
