import { z } from 'zod'

const CONNECT_EVENT_SCHEMA = z
  .object({})
  .describe('socket.io Client connect event does not have any arguments, so the object is empty')

const DISCONNECT_EVENT_SCHEMA = z.object({
  reason: z.string().describe('Disconnect reason'),
  context: z.any().optional().describe('Disconnect context'),
})

export const ReservedSocketEvents = {
  connect: {
    schema: CONNECT_EVENT_SCHEMA,
  },
  disconnect: {
    schema: DISCONNECT_EVENT_SCHEMA,
  },
}
