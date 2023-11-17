import { z } from 'zod'

const DISCONNECT_EVENT_SCHEMA = z.tuple([z.string().describe('Disconnect reason')])

export const ReservedSocketEvents = {
	disconnect: {
		schema: DISCONNECT_EVENT_SCHEMA,
	},
}
