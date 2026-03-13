import type { z } from 'zod/v4'
import type { HttpStatusCode, SuccessfulHttpStatusCode } from '../HttpStatusCodes.ts'

export type InferSchemaInput<T extends z.ZodSchema | undefined> = T extends z.ZodSchema
  ? z.input<T>
  : T extends undefined
    ? undefined
    : never

export type InferSchemaOutput<T extends z.ZodSchema | undefined> = T extends z.ZodSchema
  ? z.output<T>
  : T extends undefined
    ? undefined
    : never

type Prettify<T> = {
    [K in keyof T]: T[K];
} & {};

export type ExtractPathParams<T extends `/${string}`> = Prettify<
    T extends `/${infer Current}/${infer Rest}`
        ? Current extends `:${infer Param}`
            ? { [key in Param]: string } & ExtractPathParams<`/${Rest}`>
            : ExtractPathParams<`/${Rest}`>
        : T extends `/:${infer Param}`
            ? { [key in Param]: string }
            : Record<never, never>
>;

export type ValueOf<ObjectType, ValueType extends keyof ObjectType = keyof ObjectType> = ObjectType[ValueType];

/**
 * Infers the union of all success response schemas from a responseSchemaByStatusCode map.
 */
export type InferSuccessSchema<
  ResponseSchemasByStatusCode extends Partial<Record<HttpStatusCode, z.Schema>> | undefined,
> =
  ResponseSchemasByStatusCode extends Partial<Record<HttpStatusCode, z.Schema>>
    ? ValueOf<ResponseSchemasByStatusCode, Extract<keyof ResponseSchemasByStatusCode, SuccessfulHttpStatusCode>>
    : undefined
