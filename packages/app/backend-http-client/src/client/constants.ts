import type { MayOmit } from '@lokalise/node-core'
import type { Client } from 'undici'

import type { RequestOptions } from './types'

export const DEFAULT_OPTIONS = {
  validateResponse: true,
  throwOnError: true,
  timeout: 30000,
} satisfies MayOmit<
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
