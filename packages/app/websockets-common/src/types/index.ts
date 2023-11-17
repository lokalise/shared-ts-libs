import { type z, type ZodTuple } from 'zod'

import { type ReservedClientToServerEvents, type ReservedServerToClientEvents } from '../events'

export interface WebsocketEvent {
	schema: ZodTuple | ZodTuple<[]>
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
		...args: WebsocketEventSchema<EventMap, EventName>
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
