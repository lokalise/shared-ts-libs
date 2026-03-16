import type { z } from 'zod/v4'
import type { SuccessfulHttpStatusCode } from '../HttpStatusCodes.ts'
import type { ResponseSchemasByStatusCode } from './defineRouteContract.ts'

type InferSchemaOutput<T extends z.ZodSchema | undefined> = T extends z.ZodSchema
  ? z.output<T>
  : undefined

/** Maps ContractNoBodyType and ContractNonJsonResponseType to undefined, preserving z.Schema as-is. */
type ToZodSchema<T> = T extends z.Schema ? T : undefined

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
