import type { z } from 'zod/v4'
import type { SuccessfulHttpStatusCode } from '../HttpStatusCodes.ts'
import type { ResponseSchemasByStatusCode, TypedNonJsonResponse } from './defineRouteContract.ts'

type InferSchemaOutput<T extends z.ZodSchema | undefined> = T extends z.ZodSchema
  ? z.output<T>
  : undefined

/**
 * Maps sentinels to their effective Zod schema:
 * - TypedNonJsonResponse<S> → S (the inner schema)
 * - ContractNoBodyType / ContractNonJsonResponseType → undefined
 * - z.Schema → preserved as-is
 */
type ToZodSchema<T> =
  T extends TypedNonJsonResponse<infer S> ? S : T extends z.Schema ? T : undefined

type ValueOf<
  ObjectType,
  ValueType extends keyof ObjectType = keyof ObjectType,
> = ObjectType[ValueType]

/**
 * Infers the union of all success response Zod schemas from a responseSchemaByStatusCode map.
 * ContractNoBody entries are mapped to undefined.
 */
export type InferSuccessSchema<T extends ResponseSchemasByStatusCode | undefined> =
  T extends ResponseSchemasByStatusCode
    ? ToZodSchema<ValueOf<T, Extract<keyof T, SuccessfulHttpStatusCode>>>
    : undefined

/**
 * Infers the union of TypeScript output types of all success response schemas
 * from a responseSchemasByStatusCode map.
 */
export type InferSuccessResponse<T extends ResponseSchemasByStatusCode | undefined> =
  InferSchemaOutput<InferSuccessSchema<T>>

type IsNonJsonResponseValue<T> = T extends TypedNonJsonResponse ? true : false

/**
 * Returns true if any success status code entry is ContractNonJsonResponse or TypedNonJsonResponse.
 */
export type HasAnyNonJsonSuccessResponse<T extends ResponseSchemasByStatusCode | undefined> =
  T extends ResponseSchemasByStatusCode
    ? true extends IsNonJsonResponseValue<ValueOf<T, Extract<keyof T, SuccessfulHttpStatusCode>>>
      ? true
      : false
    : false
