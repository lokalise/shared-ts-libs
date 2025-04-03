import {setupServer} from "msw/node";
import {afterAll, afterEach, beforeAll, describe, expect, it} from "vitest";
import wretch from "wretch";
import {http, HttpResponse} from "msw";
import {z} from "zod";
import {buildPayloadRoute} from "@lokalise/api-contracts";
import {sendByPayloadRoute} from './client.js';

const server = setupServer()

beforeAll(() => {
    server.listen({ onUnhandledRequest: 'error' })
})

afterEach(() => {
    server.resetHandlers()
})

afterAll(() => {
    server.close()
})

const BASE_URL = 'http://localhost:8080/'

describe('sendByRoute', () => {
    it('returns deserialized response for POST', async () => {
        const client = wretch(BASE_URL)

        http.post(`${BASE_URL}users/1`, () =>
            HttpResponse.json({data: {code: 99}}),
        )

        const requestBodySchema = z.object({
            isActive: z.boolean(),
        })

        const responseBodySchema = z.object({
            data: z.object({
                code: z.number(),
            }),
        })

        const pathSchema = z.object({
            userId: z.number(),
        })

        const routeDefinition = buildPayloadRoute({
            method: 'post',
            successResponseBodySchema: responseBodySchema,
            requestPathParamsSchema: pathSchema,
            requestBodySchema: requestBodySchema,
            pathResolver: (pathParams) => `/users/${pathParams.userId}`,
        })

        const responseBody = await sendByPayloadRoute(client, routeDefinition, {
            pathParams: {
                userId: 1,
            },
            body: {
                isActive: true,
            },
        })

        expect(responseBody).toEqual({
            data: {
                code: 99,
            },
        })
    })
})
