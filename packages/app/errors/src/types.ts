import type { z } from 'zod/v4'
import type { ErrorType } from './constants.ts'

export type ErrorDetails = Record<string, unknown>

/**
 * Reusable specification for a public error: unique code, error category, and
 * an optional Zod schema for type-safe details and OpenAPI schema generation.
 */
export interface PublicErrorDefinition {
  /** Unique error code — becomes a literal type for TS discrimination */
  code: string
  /** Error category for protocol-agnostic error handling */
  type: ErrorType
  /** Optional Zod object schema — makes `details` required and typed when provided */
  detailsSchema?: z.ZodObject
}

/** Infers the TypeScript type of error details from a Zod schema. */
export type InferDetails<TDef extends PublicErrorDefinition> =
  TDef['detailsSchema'] extends z.ZodObject
    ? z.infer<TDef['detailsSchema']>
    : undefined
