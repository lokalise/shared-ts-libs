import { ReservedRoomEvents } from './reservedRoomEvents.js'
import { ReservedSocketEvents } from './reservedSocketEvents.js'

export const ClientToServerEvents = {
  ...ReservedRoomEvents,
  ...ReservedSocketEvents,
}
