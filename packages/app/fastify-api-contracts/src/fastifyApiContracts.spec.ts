import {buildGetController} from "./fastifyApiContracts";
import {buildGetRoute} from "@lokalise/universal-ts-utils/dist/public/api-contracts/apiContracts";
import {z} from "zod";
import {expect} from "vitest";

const BODY_SCHEMA = z.object({})
const PATH_PARAMS_SCHEMA = z.object({
    userId: z.string(),
})
const PATH_PARAMS_MULTI_SCHEMA = z.object({
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

        const controller = buildGetController(contract, (req) => {
            expect(req.params.userId).toEqual('1')
        })
    })
})
