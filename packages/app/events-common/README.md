# Common events library

This library abstracts common models for working with queues and topics.

## Getting Started

Install all dependencies:

```shell
npm install
```

Run all tests:

```shell
npm run test
```

## Usage:

Use base event schema with you defined event payload.
Example:

```typescript
export type IMPORT_CONTENT_PAYLOAD_SCHEMA = z.object({
    youField: z.string(),
})

export const IMPORT_CONTENT_SCHEMA = z.intersection(
	BASE_EVENT_SCHEMA,
	z.object({
		payload: IMPORT_CONTENT_PAYLOAD_SCHEMA,
	}),
)
```

In this example `BASE_EVENT_SCHEMA` payload will be overridden by `IMPORT_CONTENT_PAYLOAD_SCHEMA`
