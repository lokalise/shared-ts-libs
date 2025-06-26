import type { WretchResponse } from 'wretch'
import type { ZodError, z } from 'zod/v4'
import type { Either } from './either.ts'
import { failure, success } from './either.ts'

export type BodyParseResult<RequestBodySchema extends z.ZodSchema> = Either<
  'NOT_JSON' | 'EMPTY_RESPONSE' | ZodError<RequestBodySchema>,
  z.output<RequestBodySchema>
>

export function tryToResolveJsonBody<RequestBodySchema extends z.ZodSchema>(
  response: WretchResponse,
  path: string,
  schema: RequestBodySchema,
  isEmptyResponseExpected = false,
): Promise<BodyParseResult<RequestBodySchema>> {
  if (response.status === 204) {
    return Promise.resolve({
      error: 'EMPTY_RESPONSE',
    })
  }

  if (!response.headers.get('content-type')?.includes('application/json')) {
    // 202 often returns empty body as well, and if we explicitly say empty response is expected, we assume that's why it's not json
    if (response.status === 202 && isEmptyResponseExpected) {
      return Promise.resolve({
        error: 'EMPTY_RESPONSE',
      })
    }

    return Promise.resolve({
      error: 'NOT_JSON',
    })
  }

  return response.json().then((responseBody) => {
    return parseResponseBody({
      response: responseBody,
      responseBodySchema: schema,
      path,
    })
  }) as Promise<BodyParseResult<RequestBodySchema>>
}

export function parseResponseBody<ResponseBody>({
  response,
  responseBodySchema,
  path,
}: {
  response: unknown
  responseBodySchema: z.ZodSchema<ResponseBody>
  path: string
}): Either<z.ZodError, ResponseBody> {
  const result = responseBodySchema.safeParse(response)

  if (!result.success) {
    // biome-ignore lint/suspicious/noConsole: <biome v2 migration>
    console.error({
      path,
      response,
      error: result.error,
    })

    return failure(result.error)
  }

  return success(result.data)
}

export function parseRequestBody<RequestBodySchema extends z.Schema>({
  body,
  requestBodySchema,
  path,
}: {
  body: unknown
  requestBodySchema?: RequestBodySchema
  path: string
}): Either<z.ZodError, z.input<RequestBodySchema>> {
  if (!body) {
    return success(body as z.input<RequestBodySchema>)
  }

  if (!requestBodySchema) {
    return success(body as z.input<RequestBodySchema>)
  }

  const result = requestBodySchema.safeParse(body)

  if (!result.success) {
    // biome-ignore lint/suspicious/noConsole: <biome v2 migration>
    console.error({
      path,
      body,
      error: result.error,
    })
    return failure(result.error)
  }

  return success(body as z.input<RequestBodySchema>)
}
