import { stringify } from 'fast-querystring'
import type { z } from 'zod/v4'

import type { Either } from './either.ts'
import { failure, success } from './either.ts'

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
