import { stringify } from 'fast-querystring'
import type { z } from 'zod'

import type { Either } from './either.js'
import { failure, success } from './either.js'

export function parseQueryParams<RequestQuerySchema extends z.Schema>({
  queryParams,
  queryParamsSchema,
  path,
}: {
  queryParams: unknown
  queryParamsSchema?: RequestQuerySchema
  path: string
}): Either<z.ZodError, string> {
  if (!queryParams) {
    return success('')
  }

  if (!queryParamsSchema) {
    return success(`?${stringify(queryParams)}`)
  }

  const result = queryParamsSchema.safeParse(queryParams)

  if (!result.success) {
    console.error({
      path,
      queryParams,
      error: result.error,
    })
    return failure(result.error)
  }

  return success(`?${stringify(queryParams)}`)
}
