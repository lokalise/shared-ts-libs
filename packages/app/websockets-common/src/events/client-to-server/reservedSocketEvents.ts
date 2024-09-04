import { z } from 'zod'

const DISCONNECT_EVENT_SCHEMA = z.object({ reason: z.string().describe('Disconnect reason') })

export const ReservedSocketEvents = {
  disconnect: {
    schema: DISCONNECT_EVENT_SCHEMA,
  },
}
