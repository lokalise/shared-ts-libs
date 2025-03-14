import { ClientToServerEvents } from './client-to-server/index.js'
import { ServerToClientEvents } from './server-to-client/index.js'

export const ReservedClientToServerEvents = {
  ...ClientToServerEvents,
}
export const ReservedServerToClientEvents = {
  ...ServerToClientEvents,
}
