import { z } from 'zod'

const CONNECT_EVENT_SCHEMA = z
	.tuple([])
	.describe('socket.io Client connect event does not have any arguments, so the tuple is empty')

const DISCONNECT_EVENT_SCHEMA = z.tuple([
	z.string().describe('Disconnect reason'),
	z.any().optional().describe('Disconnect context'),
])

export const ReservedSocketEvents = {
	connect: {
		schema: CONNECT_EVENT_SCHEMA,
	},
	disconnect: {
		schema: DISCONNECT_EVENT_SCHEMA,
	},
}
