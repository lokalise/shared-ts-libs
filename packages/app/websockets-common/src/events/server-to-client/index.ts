import { ReservedRoomEvents } from './reservedRoomEvents.js'
import { ReservedSocketEvents } from './reservedSocketEvents.js'

export const ServerToClientEvents = {
  ...ReservedRoomEvents,
  ...ReservedSocketEvents,
}
