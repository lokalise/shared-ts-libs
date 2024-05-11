import type { Interceptable } from "undici";
import { Client, MockAgent, setGlobalDispatcher } from "undici";
import { isInternalRequestError } from "undici-retry";
import { z } from "zod";

import type { HttpRequestContext } from "./httpClient";
import {
  buildClient,
  sendDelete,
  sendGet,
  sendPatch,
  sendPost,
  sendPostBinary,
  sendPut,
  sendPutBinary,
} from "./httpClient";
import mockProduct1 from "./mock-data/mockProduct1.json";
import mockProductsLimit3 from "./mock-data/mockProductsLimit3.json";

const JSON_HEADERS = {
  "content-type": "application/json",
};

const TEXT_HEADERS = {
  "content-type": "text/plain",
};

const baseUrl = "https://fakestoreapi.com";
const reqContext: HttpRequestContext = {
  reqId: "dummyId",
};

describe("httpClient", () => {
  let mockAgent: MockAgent;
  let client: Client & Interceptable;
  beforeEach(() => {
    mockAgent = new MockAgent();
    mockAgent.disableNetConnect();
    setGlobalDispatcher(mockAgent);
    client = mockAgent.get(baseUrl) as unknown as Client & Interceptable;
  });

  describe("buildClient", () => {
    it("creates a client", () => {
      const client = buildClient(baseUrl);
      expect(client).toBeInstanceOf(Client);
    });
  });

  describe("GET", () => {
    it("validates response structure with provided schema, throws an error", async () => {
      const schema = z.object({
        id: z.string(),
      });

      client
        .intercept({
          path: "/products/1",
          method: "GET",
        })
        .reply(200, mockProduct1, { headers: JSON_HEADERS });

      await expect(
        sendGet(client, "/products/1", {
          responseSchema: schema,
          reqContext,
          validateResponse: true,
        }),
      ).rejects.toThrow(/Expected string, received number/);
    });

    it("validates response structure with provided schema, passes validation", async () => {
      const schema = z.object({
        category: z.string(),
        description: z.string(),
        id: z.number(),
        image: z.string(),
        price: z.number(),
        rating: z.object({
          count: z.number(),
          rate: z.number(),
        }),
        title: z.string(),
      });

      client
        .intercept({
          path: "/products/1",
          method: "GET",
        })
        .reply(200, mockProduct1, { headers: JSON_HEADERS });

      const result = await sendGet(client, "/products/1", {
        responseSchema: schema,
        validateResponse: true,
      });

      expect(result.result.body).toEqual(mockProduct1);
    });

    it("validates response structure with provided schema, skips validation", async () => {
      const schema = z.object({
        id: z.string(),
      });

      client
        .intercept({
          path: "/products/1",
          method: "GET",
        })
        .reply(200, mockProduct1, { headers: JSON_HEADERS });

      const result = await sendGet(client, "/products/1", {
        responseSchema: schema,
        validateResponse: false,
      });

      expect(result.result.body).toEqual(mockProduct1);
    });

    it("validates response structure with provided schema, no validation specified", async () => {
      client
        .intercept({
          path: "/products/1",
          method: "GET",
        })
        .reply(200, mockProduct1, { headers: JSON_HEADERS });

      const result = await sendGet(client, "/products/1", {
        validateResponse: true,
      });

      expect(result.result.body).toEqual(mockProduct1);
    });

    it("returns original payload when breaking during parsing and throw on error is true", async () => {
      expect.assertions(1);
      client
        .intercept({
          path: "/products/1",
          method: "GET",
        })
        .reply(200, "this is not a real json", { headers: JSON_HEADERS });

      try {
        await sendGet(client, "/products/1", {
          throwOnError: true,
          safeParseJson: true,
          requestLabel: "label",
        });
      } catch (err) {
        // This is needed, because built-in error assertions do not assert nested fields
        // eslint-disable-next-line vitest/no-conditional-expect
        expect(err).toMatchObject({
          message: "Error while parsing HTTP JSON response",
          errorCode: "INVALID_HTTP_RESPONSE_JSON",
          details: {
            rawBody: "this is not a real json",
            requestLabel: "label",
          },
        });
      }
    });

    it("does not throw if broken during parsing but throwOnError is false", async () => {
      expect.assertions(1);
      client
        .intercept({
          path: "/products/1",
          method: "GET",
        })
        .reply(200, "this is not a real json", { headers: JSON_HEADERS });

      const result = await sendGet(client, "/products/1", {
        throwOnError: false,
        safeParseJson: true,
        requestLabel: "label",
      });

      expect(result.error).toMatchObject({
        message: "Error while parsing HTTP JSON response",
        errorCode: "INVALID_HTTP_RESPONSE_JSON",
        details: {
          rawBody: "this is not a real json",
          requestLabel: "label",
        },
      });
    });

    it("GET without queryParams", async () => {
      client
        .intercept({
          path: "/products/1",
          method: "GET",
        })
        .reply(200, mockProduct1, { headers: JSON_HEADERS });

      const result = await sendGet(client, "/products/1");

      expect(result.result.body).toEqual(mockProduct1);
    });

    it("GET returning text", async () => {
      client
        .intercept({
          path: "/products/1",
          method: "GET",
        })
        .reply(200, "just text", {
          headers: TEXT_HEADERS,
        });

      const result = await sendGet(client, "/products/1");

      expect(result.result.body).toBe("just text");
    });

    it("GET returning text without content type", async () => {
      client
        .intercept({
          path: "/products/1",
          method: "GET",
        })
        .reply(200, "just text", {});

      const result = await sendGet<string>(client, "/products/1");

      expect(result.result.body).toBe("just text");
    });

    it("GET with queryParams", async () => {
      const query = {
        limit: 3,
      };

      client
        .intercept({
          path: "/products",
          method: "GET",
          query,
        })
        .reply(200, mockProductsLimit3, { headers: JSON_HEADERS });

      const result = await sendGet(client, "/products", {
        query,
      });

      expect(result.result.body).toEqual(mockProductsLimit3);
    });

    it("Throws an error on internal error", async () => {
      expect.assertions(1);
      const query = {
        limit: 3,
      };

      client
        .intercept({
          path: "/products",
          method: "GET",
          query,
        })
        .replyWithError(new Error("connection error"));

      await expect(
        sendGet(client, "/products", {
          query,
        }),
      ).rejects.toMatchObject({
        message: "connection error",
      });
    });

    it("Throws an error with a label on internal error", async () => {
      expect.assertions(2);
      const query = {
        limit: 3,
      };

      try {
        await sendGet(buildClient("http://127.0.0.1:999"), "/dummy", {
          requestLabel: "label",
          throwOnError: true,
          query,
        });
      } catch (err) {
        if (!isInternalRequestError(err)) {
          throw new Error("Invalid error type");
        }
        expect(err.message).toBe("connect ECONNREFUSED 127.0.0.1:999");
        expect(err.requestLabel).toBe("label");
      }
    });

    it("Returns error response", async () => {
      expect.assertions(1);
      const query = {
        limit: 3,
      };

      client
        .intercept({
          path: "/products",
          method: "GET",
          query,
        })
        .reply(400, "Invalid request");

      await expect(
        sendGet(client, "/products", {
          query,
          requestLabel: "label",
        }),
      ).rejects.toMatchObject({
        message: "Response status code 400",
        response: {
          body: "Invalid request",
          statusCode: 400,
        },
        details: {
          requestLabel: "label",
          response: {
            body: "Invalid request",
            statusCode: 400,
          },
        },
      });
    });

    it("Works with retry", async () => {
      expect.assertions(1);
      const query = {
        limit: 3,
      };

      client
        .intercept({
          path: "/products",
          method: "GET",
          query,
        })
        .reply(500, "Invalid request");
      client
        .intercept({
          path: "/products",
          method: "GET",
          query,
        })
        .reply(200, "OK");

      const response = await sendGet(client, "/products", {
        query,
        retryConfig: {
          statusCodesToRetry: [500],
          retryOnTimeout: false,
          delayBetweenAttemptsInMsecs: 0,
          maxAttempts: 2,
        },
      });

      expect(response.result.body).toBe("OK");
    });
  });

  describe("DELETE", () => {
    it("DELETE without queryParams", async () => {
      client
        .intercept({
          path: "/products/1",
          method: "DELETE",
        })
        .reply(204, undefined, { headers: TEXT_HEADERS });

      const result = await sendDelete(client, "/products/1", {
        reqContext,
      });

      expect(result.result.statusCode).toBe(204);
      expect(result.result.body).toBe("");
    });

    it("DELETE with queryParams", async () => {
      const query = {
        limit: 3,
      };

      client
        .intercept({
          path: "/products",
          method: "DELETE",
          query,
        })
        .reply(204, undefined, { headers: TEXT_HEADERS });

      const result = await sendDelete(client, "/products", {
        query,
      });

      expect(result.result.statusCode).toBe(204);
      expect(result.result.body).toBe("");
    });

    it("Throws an error on internal error", async () => {
      expect.assertions(1);
      const query = {
        limit: 3,
      };

      client
        .intercept({
          path: "/products",
          method: "DELETE",
          query,
        })
        .replyWithError(new Error("connection error"));

      await expect(
        sendDelete(client, "/products", {
          query,
        }),
      ).rejects.toMatchObject({
        message: "connection error",
      });
    });
  });

  describe("POST", () => {
    it("validates response structure with provided schema, throws an error", async () => {
      const schema = z.object({
        id: z.string(),
      });

      client
        .intercept({
          path: "/products/1",
          method: "POST",
        })
        .reply(200, mockProduct1, { headers: JSON_HEADERS });

      await expect(
        sendPost(
          client,
          "/products/1",
          {},
          {
            responseSchema: schema,
            validateResponse: true,
          },
        ),
      ).rejects.toThrow(/Expected string, received number/);
    });

    it("validates response structure with provided schema, passes validation", async () => {
      const schema = z.object({
        category: z.string(),
        description: z.string(),
        id: z.number(),
        image: z.string(),
        price: z.number(),
        rating: z.object({
          count: z.number(),
          rate: z.number(),
        }),
        title: z.string(),
      });

      client
        .intercept({
          path: "/products/1",
          method: "POST",
        })
        .reply(200, mockProduct1, { headers: JSON_HEADERS });

      const result = await sendPost(
        client,
        "/products/1",
        {},
        {
          responseSchema: schema,
          validateResponse: true,
          reqContext,
        },
      );

      expect(result.result.body).toEqual(mockProduct1);
    });

    it("validates response structure with provided schema, skips validation", async () => {
      const schema = z.object({
        id: z.string(),
      });

      client
        .intercept({
          path: "/products/1",
          method: "POST",
        })
        .reply(200, mockProduct1, { headers: JSON_HEADERS });

      const result = await sendPost(
        client,
        "/products/1",
        {},
        {
          responseSchema: schema,
          validateResponse: false,
        },
      );

      expect(result.result.body).toEqual(mockProduct1);
    });

    it("POST without queryParams", async () => {
      client
        .intercept({
          path: "/products",
          method: "POST",
        })
        .reply(200, { id: 21 }, { headers: JSON_HEADERS });

      const result = await sendPost(client, "/products", mockProduct1);

      expect(result.result.body).toEqual({ id: 21 });
    });

    it("POST without body", async () => {
      client
        .intercept({
          path: "/products",
          method: "POST",
        })
        .reply(200, { id: 21 }, { headers: JSON_HEADERS });

      const result = await sendPost(client, "/products", undefined);

      expect(result.result.body).toEqual({ id: 21 });
    });

    it("POST with queryParams", async () => {
      const query = {
        limit: 3,
      };

      client
        .intercept({
          path: "/products",
          method: "POST",
          query,
        })
        .reply(200, { id: 21 }, { headers: JSON_HEADERS });

      const result = await sendPost(client, "/products", mockProduct1, {
        query,
      });

      expect(result.result.body).toEqual({ id: 21 });
    });

    it("POST that returns 400 throws an error", async () => {
      client
        .intercept({
          path: "/products",
          method: "POST",
        })
        .reply(400, { errorCode: "err" }, { headers: JSON_HEADERS });

      await expect(sendPost(client, "/products", mockProduct1)).rejects.toThrow(
        "Response status code 400",
      );
    });

    it("Throws an error on internal error", async () => {
      expect.assertions(1);
      const query = {
        limit: 3,
      };

      client
        .intercept({
          path: "/products",
          method: "POST",
          query,
        })
        .replyWithError(new Error("connection error"));

      await expect(
        sendPost(client, "/products", undefined, {
          query,
        }),
      ).rejects.toMatchObject({
        message: "connection error",
      });
    });
  });

  describe("POST binary", () => {
    it("validates response structure with provided schema, throws an error", async () => {
      const schema = z.object({
        id: z.string(),
      });

      client
        .intercept({
          path: "/products/1",
          method: "POST",
        })
        .reply(200, mockProduct1, { headers: JSON_HEADERS });

      await expect(
        sendPostBinary(client, "/products/1", Buffer.from(JSON.stringify({})), {
          responseSchema: schema,
          validateResponse: true,
        }),
      ).rejects.toThrow(/Expected string, received number/);
    });

    it("validates response structure with provided schema, passes validation", async () => {
      const schema = z.object({
        category: z.string(),
        description: z.string(),
        id: z.number(),
        image: z.string(),
        price: z.number(),
        rating: z.object({
          count: z.number(),
          rate: z.number(),
        }),
        title: z.string(),
      });

      client
        .intercept({
          path: "/products/1",
          method: "POST",
        })
        .reply(200, mockProduct1, { headers: JSON_HEADERS });

      const result = await sendPostBinary(
        client,
        "/products/1",
        Buffer.from(JSON.stringify({})),
        {
          responseSchema: schema,
          validateResponse: true,
          reqContext,
        },
      );

      expect(result.result.body).toEqual(mockProduct1);
    });

    it("validates response structure with provided schema, skips validation", async () => {
      const schema = z.object({
        id: z.string(),
      });

      client
        .intercept({
          path: "/products/1",
          method: "POST",
        })
        .reply(200, mockProduct1, { headers: JSON_HEADERS });

      const result = await sendPostBinary(
        client,
        "/products/1",
        Buffer.from(JSON.stringify({})),
        {
          responseSchema: schema,
          validateResponse: false,
        },
      );

      expect(result.result.body).toEqual(mockProduct1);
    });

    it("POST without queryParams", async () => {
      client
        .intercept({
          path: "/products",
          method: "POST",
        })
        .reply(200, { id: 21 }, { headers: JSON_HEADERS });

      const result = await sendPostBinary(
        client,
        "/products",
        Buffer.from(JSON.stringify(mockProduct1)),
      );

      expect(result.result.body).toEqual({ id: 21 });
    });

    it("POST with queryParams", async () => {
      const query = {
        limit: 3,
      };

      client
        .intercept({
          path: "/products",
          method: "POST",
          query,
        })
        .reply(200, { id: 21 }, { headers: JSON_HEADERS });

      const result = await sendPostBinary(
        client,
        "/products",
        Buffer.from(JSON.stringify(mockProduct1)),
        {
          query,
        },
      );

      expect(result.result.body).toEqual({ id: 21 });
    });

    it("POST that returns 400 throws an error", async () => {
      client
        .intercept({
          path: "/products",
          method: "POST",
        })
        .reply(400, { errorCode: "err" }, { headers: JSON_HEADERS });

      await expect(
        sendPostBinary(
          client,
          "/products",
          Buffer.from(JSON.stringify(mockProduct1)),
        ),
      ).rejects.toThrow("Response status code 400");
    });

    it("Throws an error on internal error", async () => {
      expect.assertions(1);
      const query = {
        limit: 3,
      };

      client
        .intercept({
          path: "/products",
          method: "POST",
          query,
        })
        .replyWithError(new Error("connection error"));

      await expect(
        sendPostBinary(client, "/products", Buffer.from(JSON.stringify({})), {
          query,
        }),
      ).rejects.toMatchObject({
        message: "connection error",
      });
    });
  });

  describe("PUT", () => {
    it("PUT without queryParams", async () => {
      client
        .intercept({
          path: "/products/1",
          method: "PUT",
        })
        .reply(200, { id: 21 }, { headers: JSON_HEADERS });

      const result = await sendPut(client, "/products/1", mockProduct1, {
        reqContext,
      });

      expect(result.result.body).toEqual({ id: 21 });
    });

    it("PUT without body", async () => {
      client
        .intercept({
          path: "/products/1",
          method: "PUT",
        })
        .reply(200, { id: 21 }, { headers: JSON_HEADERS });

      const result = await sendPut(client, "/products/1", undefined);

      expect(result.result.body).toEqual({ id: 21 });
    });

    it("PUT with queryParams", async () => {
      const query = {
        limit: 3,
      };

      client
        .intercept({
          path: "/products/1",
          method: "PUT",
          query,
        })
        .reply(200, { id: 21 }, { headers: JSON_HEADERS });

      const result = await sendPut(client, "/products/1", mockProduct1, {
        query,
      });

      expect(result.result.body).toEqual({ id: 21 });
    });

    it("PUT that returns 400 throws an error", async () => {
      client
        .intercept({
          path: "/products/1",
          method: "PUT",
        })
        .reply(400, { errorCode: "err" }, { headers: JSON_HEADERS });

      await expect(
        sendPut(client, "/products/1", mockProduct1),
      ).rejects.toThrow("Response status code 400");
    });

    it("Throws an error on internal error", async () => {
      expect.assertions(1);
      const query = {
        limit: 3,
      };

      client
        .intercept({
          path: "/products",
          method: "PUT",
          query,
        })
        .replyWithError(new Error("connection error"));

      await expect(
        sendPut(client, "/products", undefined, {
          query,
        }),
      ).rejects.toMatchObject({
        message: "connection error",
      });
    });
  });

  describe("PUT binary", () => {
    it("PUT without queryParams", async () => {
      client
        .intercept({
          path: "/products/1",
          method: "PUT",
        })
        .reply(200, { id: 21 }, { headers: JSON_HEADERS });

      const result = await sendPutBinary(
        client,
        "/products/1",
        Buffer.from("text"),
        {
          reqContext,
        },
      );

      expect(result.result.body).toEqual({ id: 21 });
    });

    it("PUT with queryParams", async () => {
      const query = {
        limit: 3,
      };

      client
        .intercept({
          path: "/products/1",
          method: "PUT",
          query,
        })
        .reply(200, { id: 21 }, { headers: JSON_HEADERS });

      const result = await sendPutBinary(
        client,
        "/products/1",
        Buffer.from("text"),
        {
          query,
        },
      );

      expect(result.result.body).toEqual({ id: 21 });
    });

    it("PUT that returns 400 throws an error", async () => {
      client
        .intercept({
          path: "/products/1",
          method: "PUT",
        })
        .reply(400, { errorCode: "err" }, { headers: JSON_HEADERS });

      await expect(
        sendPutBinary(client, "/products/1", Buffer.from("text")),
      ).rejects.toThrow("Response status code 400");
    });

    it("Throws an error on internal error", async () => {
      expect.assertions(1);
      const query = {
        limit: 3,
      };

      client
        .intercept({
          path: "/products",
          method: "PUT",
          query,
        })
        .replyWithError(new Error("connection error"));

      await expect(
        sendPutBinary(client, "/products", null, {
          query,
        }),
      ).rejects.toMatchObject({
        message: "connection error",
      });
    });
  });

  describe("PATCH", () => {
    it("PATCH without queryParams", async () => {
      client
        .intercept({
          path: "/products/1",
          method: "PATCH",
        })
        .reply(200, { id: 21 }, { headers: JSON_HEADERS });

      const result = await sendPatch(client, "/products/1", mockProduct1);

      expect(result.result.body).toEqual({ id: 21 });
    });

    it("PATCH without body", async () => {
      client
        .intercept({
          path: "/products/1",
          method: "PATCH",
        })
        .reply(200, { id: 21 }, { headers: JSON_HEADERS });

      const result = await sendPatch(client, "/products/1", undefined);

      expect(result.result.body).toEqual({ id: 21 });
    });

    it("PATCH with queryParams", async () => {
      const query = {
        limit: 3,
      };

      client
        .intercept({
          path: "/products/1",
          method: "PATCH",
          query,
        })
        .reply(200, { id: 21 }, { headers: JSON_HEADERS });

      const result = await sendPatch(client, "/products/1", mockProduct1, {
        query,
        reqContext,
      });

      expect(result.result.body).toEqual({ id: 21 });
    });

    it("PATCH that returns 400 throws an error", async () => {
      client
        .intercept({
          path: "/products/1",
          method: "PATCH",
        })
        .reply(400, { errorCode: "err" }, { headers: JSON_HEADERS });

      await expect(
        sendPatch(client, "/products/1", mockProduct1),
      ).rejects.toThrow("Response status code 400");
    });

    it("Throws an error on internal error", async () => {
      expect.assertions(1);
      const query = {
        limit: 3,
      };

      client
        .intercept({
          path: "/products",
          method: "PATCH",
          query,
        })
        .replyWithError(new Error("connection error"));

      await expect(
        sendPatch(client, "/products", undefined, {
          query,
        }),
      ).rejects.toMatchObject({
        message: "connection error",
      });
    });
  });
});
