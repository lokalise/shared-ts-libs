import { buildGetRoute } from '@lokalise/universal-ts-utils/node'
import { z } from 'zod'
import { buildGetController } from './fastifyApiContracts'

const BODY_SCHEMA = z.object({})
const PATH_PARAMS_SCHEMA = z.object({
  userId: z.string(),
})
const _PATH_PARAMS_MULTI_SCHEMA = z.object({
  userId: z.string(),
  orgId: z.string(),
})

describe('fastifyApiContracts', () => {
  describe('buildGetRoute', () => {
    const contract = buildGetRoute({
      responseBodySchema: BODY_SCHEMA,
      requestPathParamsSchema: PATH_PARAMS_SCHEMA,
      pathResolver: (pathParams) => `/users/${pathParams.userId}`,
    })

    const _controller = buildGetController(contract, (req) => {
      expect(req.params.userId).toEqual('1')
      return Promise.resolve()
    })

    // ToDo instantiate fastify and make a call
  })
})
