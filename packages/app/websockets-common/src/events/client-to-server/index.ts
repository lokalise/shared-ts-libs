import { ReservedRoomEvents } from './reservedRoomEvents.ts'
import { ReservedSocketEvents } from './reservedSocketEvents.ts'

export const ClientToServerEvents = {
  ...ReservedRoomEvents,
  ...ReservedSocketEvents,
}
