import type { MayOmit } from '@lokalise/node-core'
import type { Client } from 'undici'

import { z } from 'zod'
import type { RequestOptions } from './types.ts'

export const DEFAULT_OPTIONS = {
  validateResponse: true,
  throwOnError: true,
  timeout: 30000,
} satisfies MayOmit<
  // biome-ignore lint/suspicious/noExplicitAny: <explanation>
  RequestOptions<unknown, any, true>,
  'requestLabel' | 'responseSchema' | 'isEmptyResponseExpected'
>

export const defaultClientOptions: Partial<Client.Options> = {
  keepAliveMaxTimeout: 300_000,
  keepAliveTimeout: 4000,
}

export const JSON_HEADERS = {
  'Content-Type': 'application/json',
}

// biome-ignore lint/suspicious/noExplicitAny: <explanation>
export const TEST_OPTIONS: RequestOptions<unknown, any, true> = {
  requestLabel: 'test',
  responseSchema: z.unknown(),
}

/**
 * Technically 204 will send an empty body, but undici-retry defaults to parsing unknown mimetype as text for
 * compatibility reasons, so we should expect to get an empty string here
 */
export const NO_CONTENT_RESPONSE_SCHEMA = z.string().length(0)

/**
 * This schema is to be used when we don't really care about the response type and are prepared to accept any value
 */
export const UNKNOWN_RESPONSE_SCHEMA = z.unknown()
