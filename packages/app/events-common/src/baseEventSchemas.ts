import type { ZodObject, ZodTypeAny } from 'zod'
import z from 'zod'

export const BASE_EVENT_SCHEMA = z.object({
	id: z.string().uuid().describe('event unique identifier'),
	type: z.literal<string>('<replace.me>').describe('event type name'),
	timestamp: z.string().datetime().describe('iso 8601 datetime'),
	source: z.string().min(1).describe('source service of the event'),
	payload: z.optional(z.object({})).describe('event payload based on type'),
	metadata: z
		.object({
			schemaVersion: z.string().min(1).describe('base event schema version'),
			originalApp: z.string().min(1).describe('app/service initiated workflow'),
		})
		.describe('event metadata'),
	correlationId: z.string().describe('unique identifier passed to all events in workflow chain'),
	version: z.string().min(1).describe('event payload version'),
})

export type BaseEventType = z.infer<typeof BASE_EVENT_SCHEMA>

export type EventDefinition = {
	schema: ZodObject<Omit<(typeof BASE_EVENT_SCHEMA)['shape'], 'payload'> & { payload: ZodTypeAny }>
	snsTopic?: string
}

export type MessageMetadata = 'id' | 'timestamp' | 'type' | 'source' | 'metadata' | 'version'

export type EventSchemaType<T extends EventDefinition> = z.infer<T['schema']>
