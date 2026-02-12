import type { z } from 'zod/v4'

export type OptionalZodSchema = z.Schema | undefined
export type InferredOptionalSchema<Schema> = Schema extends z.Schema ? z.infer<Schema> : undefined

// Helper to create a union of all response types from responseSchemasByStatusCode
// Filters out undefined values that come from Partial<Record<...>>
export type InferResponseUnion<T> = T extends object
  ? {
      [K in keyof T as T[K] extends z.Schema ? K : never]: T[K] extends z.Schema
        ? z.infer<T[K]>
        : never
    }[keyof { [K in keyof T as T[K] extends z.Schema ? K : never]: T[K] }]
  : never

// Build response type - either a union of all schemas or just the success schema
// Note: This creates a union type of all possible responses, which means TypeScript
// will accept any of the response types regardless of the status code being set.
// This is a limitation compared to Fastify's native multi-reply system which can
// narrow types based on the status code. Full multi-reply support would require
// deeper integration with Fastify's SchemaCompiler generic system.
export type BuildResponseType<SuccessSchema, ResponseSchemasByStatusCode> =
  ResponseSchemasByStatusCode extends object
    ? keyof ResponseSchemasByStatusCode extends never
      ? SuccessSchema extends z.Schema
        ? z.infer<SuccessSchema>
        : undefined
      :
          | InferResponseUnion<ResponseSchemasByStatusCode>
          | (SuccessSchema extends z.Schema
              ? 200 extends keyof ResponseSchemasByStatusCode
                ? never
                : z.infer<SuccessSchema>
              : never)
    : SuccessSchema extends z.Schema
      ? z.infer<SuccessSchema>
      : undefined
