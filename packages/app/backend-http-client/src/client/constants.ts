import type { MayOmit } from '@lokalise/node-core'
import type { Client } from 'undici'

import { z } from 'zod'
import type { RequestOptions } from './types'

export const DEFAULT_OPTIONS = {
  validateResponse: true,
  throwOnError: true,
  timeout: 30000,
} satisfies MayOmit<
  // biome-ignore lint/suspicious/noExplicitAny: <explanation>
  RequestOptions<unknown, any>,
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
export const TEST_OPTIONS: RequestOptions<unknown, any> = {
  requestLabel: 'test',
  responseSchema: z.unknown(),
}

export const NO_CONTENT_RESPONSE_SCHEMA = z.string().length(0)
