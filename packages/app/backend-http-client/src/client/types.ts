import type { Client } from "undici";
import type { RetryConfig } from "undici-retry";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type RecordObject = Record<string, any>;

export type HttpRequestContext = {
  reqId: string;
};

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
  responseSchema: ResponseSchema<T>;
  validateResponse?: boolean;
};

export type RequestOptions<
  T,
  IsEmptyResponseExpected extends boolean = false,
> = InternalRequestOptions<T> & {
  isEmptyResponseExpected?: IsEmptyResponseExpected;
};

// TODO: I think it is not used, remove on next major update
export type Response<T> = {
  body: T;
  headers: RecordObject;
  statusCode: number;
};
