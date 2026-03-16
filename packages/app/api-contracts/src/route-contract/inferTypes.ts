import type { z } from 'zod/v4'
import type { HttpStatusCode, SuccessfulHttpStatusCode } from '../HttpStatusCodes.ts'

type InferSchemaOutput<T extends z.ZodSchema | undefined> = T extends z.ZodSchema
  ? z.output<T>
  : undefined

type ValueOf<
  ObjectType,
  ValueType extends keyof ObjectType = keyof ObjectType,
> = ObjectType[ValueType]

/**
 * Infers the union of all success response schemas from a responseSchemaByStatusCode map.
 */
export type InferSuccessSchema<
  ResponseSchemasByStatusCode extends Partial<Record<HttpStatusCode, z.Schema>> | undefined,
> =
  ResponseSchemasByStatusCode extends Partial<Record<HttpStatusCode, z.Schema>>
    ? ValueOf<
        ResponseSchemasByStatusCode,
        Extract<keyof ResponseSchemasByStatusCode, SuccessfulHttpStatusCode>
      >
    : undefined

/**
 * Infers the union of TypeScript output types of all success response schemas
 * from a responseSchemasByStatusCode map.
 */
export type InferSuccessResponse<
  ResponseSchemasByStatusCode extends Partial<Record<HttpStatusCode, z.Schema>> | undefined,
> = InferSchemaOutput<InferSuccessSchema<ResponseSchemasByStatusCode>>
