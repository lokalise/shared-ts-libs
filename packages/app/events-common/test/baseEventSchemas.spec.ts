import { BASE_EVENT_SCHEMA, BaseEventType } from '../src/baseEventSchemas'

describe('BASE_EVENT_SCHEMA', () => {
	it('validates correct data', () => {
		const validData: BaseEventType = {
			id: '78beda9b-c026-4f88-b275-415af6c3d6dc',
			type: '<replace.me>',
			timestamp: new Date().toISOString(),
			source: 'source service name',
			payload: {}, // Optional, so the empty object should be fine
			metadata: {
				schemaVersion: '1.0',
				originalApp: 'originating app/service name',
			},
			correlationId: '2a970365-716e-4286-8f2a-c9584b16f471',
			version: 'payload version',
		}

		expect(() => BASE_EVENT_SCHEMA.parse(validData)).not.toThrow()
	})

	it('rejects data with missing required fields', () => {
		const dataWithMissingFields = {
			// Intentionally omitting required fields
		}

		expect(() => BASE_EVENT_SCHEMA.parse(dataWithMissingFields)).toThrow()
	})
})
