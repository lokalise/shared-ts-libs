import { z } from 'zod'

import { ROOM_ID_SCHEMA } from '../../rooms.js'

const ROOM_EVENT_SCHEMA = z.object({ roomId: ROOM_ID_SCHEMA })

export const ReservedRoomEvents = {
  'room.join': {
    schema: ROOM_EVENT_SCHEMA,
  },
  'room.leave': {
    schema: ROOM_EVENT_SCHEMA,
  },
}
