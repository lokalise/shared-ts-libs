# Websockets common package

This package contains core websocket system events and tools that can be used by backend and frontend services

## Getting started

### Server to Client events and vice-versa

Events are separated into two groups

1. Server to Client events (`server-to-client`)
2. Client to Server events (`client-to-server`)

The names are pretty self-explanatory, but the gist of it is - these dictate which events can be subscribed to and which events can be emitted. For example the Server can only subscribe to `client-to-server` events and can only emit `server-to-client` events.

### Event schemas

Event schema is a Zod tuple. Each item in a tuple represents an argument for the event.

```typescript
const DEMO_EVENT_SCHEMA = z.tuple([
	z.string().describe('First argument'),
	z.string().describe('Second argument'),
])
```

Unfortunately Zod currently does not support optional entries for tuples. But you can always use objects as your event arguments instead of individual ones.

```typescript
const DEMO_EVENT_SCHEMA = z.tuple([
	z.object({
		firstArgument: z.string().describe('This is my argument'),
		optionalArgument: z.string().optional().describe('This is optional argument'),
	}),
])
```

There is a utility `createObjectSchema` that helps you to create an event schema that accepts given object shape (instead of tuple).

```typescript
import { createObjectSchema } from '@lokalise/websockets-common'

const DEMO_EVENT_SCHEMA = createObjectSchema({
	message: z.string().describe('A message for the server'),
})
```

### Creating an event contract

An event contract is basically an object containing entries with a `schema`. Each `key` in that object is represents the event name. Here is an example event definition.

```typescript
export const DemoEvents = {
	'users.demo.request': {
		schema: DEMO_EVENT_SCHEMA,
	},
}
```

You can split your definitions into multiple files/objects and combine them later.

```typescript
export const MyEvents = {
	...DemoEvents,
	...SomeOtherEvents,
}
```
