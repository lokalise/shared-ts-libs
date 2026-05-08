import { type Either } from '@lokalise/node-core'
import type { Dispatcher } from 'undici'
import { Client } from 'undici'
import type { ZodType } from 'zod/v4'
import { resolveRetryConfig, withRetry } from '../api-contract/retry.ts'
import { InternalRequestError } from '../errors/InternalRequestError.ts'
import { ResponseParseError } from '../errors/ResponseParseError.ts'
import type { InternalRequestOptions, RequestResult } from './types.ts'

export function isRequestResult(entity: unknown): entity is RequestResult<unknown> {
  return typeof entity === 'object' && entity !== null && 'statusCode' in entity
}

export async function parseResponseBody(
  response: Dispatcher.ResponseData,
  safeParseJson: boolean,
  blobBody: boolean,
  requestLabel: string,
): Promise<unknown> {
  if (blobBody) {
    return response.body.blob()
  }
  const contentType = response.headers['content-type']
  if (typeof contentType === 'string' && contentType.startsWith('application/json')) {
    if (!safeParseJson) {
      return response.body.json()
    }
    const rawBody = await response.body.text()
    try {
      return JSON.parse(rawBody)
    } catch {
      throw new ResponseParseError({
        message: 'Error while parsing HTTP JSON response',
        errorCode: 'INVALID_HTTP_RESPONSE_JSON',
        rawBody,
        requestLabel,
      })
    }
  }
  return response.body.text()
}

export async function executeRequest<T>(
  client: Client,
  requestOptions: Dispatcher.RequestOptions,
  options: InternalRequestOptions<ZodType | undefined>,
): Promise<Either<RequestResult<unknown> | InternalRequestError, RequestResult<T>>> {
  try {
    const response = options.retryConfig
      ? await withRetry(
          () => client.request(requestOptions),
          resolveRetryConfig(options.retryConfig),
        )
      : await client.request(requestOptions)

    if (response.statusCode < 400) {
      const body = (await parseResponseBody(
        response,
        options.safeParseJson ?? false,
        options.blobResponseBody ?? false,
        options.requestLabel,
      )) as T
      return {
        result: {
          body,
          headers: response.headers,
          statusCode: response.statusCode,
          requestLabel: options.requestLabel,
        },
      }
    }

    const body = await parseResponseBody(response, false, false, options.requestLabel)
    return {
      error: {
        body,
        headers: response.headers,
        statusCode: response.statusCode,
        requestLabel: options.requestLabel,
      },
    }
  } catch (err) {
    if (err instanceof ResponseParseError) {
      return { error: err as unknown as RequestResult<unknown> | InternalRequestError }
    }
    return { error: new InternalRequestError(err, options.requestLabel) }
  }
}

export async function executeStreamRequest(
  client: Client,
  requestOptions: Dispatcher.RequestOptions,
  options: Pick<InternalRequestOptions<ZodType | undefined>, 'retryConfig' | 'requestLabel'>,
): Promise<
  Either<
    RequestResult<unknown> | InternalRequestError,
    RequestResult<Dispatcher.ResponseData['body']>
  >
> {
  try {
    const response = options.retryConfig
      ? await withRetry(
          () => client.request(requestOptions),
          resolveRetryConfig(options.retryConfig),
        )
      : await client.request(requestOptions)

    if (response.statusCode < 400) {
      return {
        result: {
          body: response.body,
          headers: response.headers,
          statusCode: response.statusCode,
          requestLabel: options.requestLabel,
        },
      }
    }

    const body = await parseResponseBody(response, false, false, options.requestLabel)
    return {
      error: {
        body,
        headers: response.headers,
        statusCode: response.statusCode,
        requestLabel: options.requestLabel,
      },
    }
  } catch (err) {
    return { error: new InternalRequestError(err, options.requestLabel) }
  }
}
