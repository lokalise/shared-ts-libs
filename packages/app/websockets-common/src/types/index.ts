import type { ZodObject, z } from 'zod/v4'
import type { ReservedClientToServerEvents, ReservedServerToClientEvents } from '../events/index.ts'

export interface WebsocketEvent {
  //biome-ignore lint/suspicious/noExplicitAny: We do not care about specific type
  schema: ZodObject<any>
}

export type WebsocketEventMap = Record<string, WebsocketEvent>

export type ReservedServerToClientWebsocketEventMap = typeof ReservedServerToClientEvents
export type ReservedClientToServerWebsocketEventMap = typeof ReservedClientToServerEvents

export interface ServerToClientWebsocketEventMap
  extends WebsocketEventMap,
    ReservedServerToClientWebsocketEventMap {}

export interface ClientToServerWebsocketEventMap
  extends WebsocketEventMap,
    ReservedClientToServerWebsocketEventMap {}

export type WebsocketEventName<WEM extends WebsocketEventMap> = keyof WEM

export type WebsocketEventSchema<
  WEM extends WebsocketEventMap,
  WEN extends WebsocketEventName<WEM>,
> = z.infer<WEM[WEN]['schema']>

/**
 * Socket.IO expects types to be defined as a Record with eventName:callbackFn.
 * See https://socket.io/docs/v4/typescript for examples.
 *
 * This generics converts our Zod schemas to compatible Socket.IO format.
 */
export type SocketIoEventMap<EventMap extends WebsocketEventMap> = {
  [EventName in WebsocketEventName<EventMap>]: (
    args: WebsocketEventSchema<EventMap, EventName>,
  ) => void
}

export type SocketIoEventHandler<
  WEM extends WebsocketEventMap,
  WEN extends WebsocketEventName<WEM>,
> = SocketIoEventMap<WEM>[WEN]

export type WebsocketEventAndRoomConfig<
  STCEM extends WebsocketEventMap,
  CTSEM extends WebsocketEventMap,
> = {
  serverToClientWebsocketEvents: STCEM
  clientToServerWebsocketEvents: CTSEM
}
