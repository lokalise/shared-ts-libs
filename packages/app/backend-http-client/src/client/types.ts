import type { Client } from "undici";
import type { RequestResult, RetryConfig } from "undici-retry";
import type { DefiniteEither } from "@lokalise/node-core";
import { ZodSchema } from "zod";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type RecordObject = Record<string, any>;

export type HttpRequestContext = {
  reqId: string;
};

// TODO: remove
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ResponseSchema<Output = any> = {
  parse(data: unknown): Output;
};

export type InternalRequestOptions<T> = {
  headers?: RecordObject;
  query?: RecordObject;
  timeout?: number | null;
  throwOnError?: boolean;
  reqContext?: HttpRequestContext;

  safeParseJson?: boolean;
  blobResponseBody?: boolean;
  requestLabel: string;

  disableKeepAlive?: boolean;
  retryConfig?: RetryConfig;
  clientOptions?: Client.Options;
  responseSchema: ZodSchema<T>;
  validateResponse?: boolean;
};

export type RequestOptions<
  T,
  IsEmptyResponseExpected extends boolean,
> = InternalRequestOptions<T> & {
  isEmptyResponseExpected?: IsEmptyResponseExpected;
};

export type RequestResultDefinitiveEither<
  T,
  IsEmptyResponseExpected extends boolean,
> = DefiniteEither<
  RequestResult<unknown>,
  IsEmptyResponseExpected extends true
    ? RequestResult<T | null>
    : RequestResult<T>
>;
