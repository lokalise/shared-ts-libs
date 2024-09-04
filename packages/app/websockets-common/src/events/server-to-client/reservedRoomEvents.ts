import { z } from 'zod'

import { ROOM_ID_SCHEMA } from '../../rooms'

const ROOM_EVENT_SCHEMA = z.object({ roomId: ROOM_ID_SCHEMA })

const ROOM_DECLINED_EVENT_SCHEMA = z.object({
  roomId: ROOM_ID_SCHEMA,
  reason: z.string().optional().describe('Reason the room join request was declined'),
})

export const ReservedRoomEvents = {
  'room.joined': {
    schema: ROOM_EVENT_SCHEMA,
  },
  'room.left': {
    schema: ROOM_EVENT_SCHEMA,
  },
  'room.declined': {
    schema: ROOM_DECLINED_EVENT_SCHEMA,
  },
}
