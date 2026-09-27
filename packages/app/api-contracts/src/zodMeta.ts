import type { RouteVisibility } from '@lokalise/api-contracts'

/**
 * Field-level visibility of a request/response property.
 */
export type FieldVisibility = RouteVisibility

/**
 * Augment Zod v4's global metadata so `.meta({ visibility: 'internal' })` is
 * type-checked against {@link FieldVisibility}.
 */
declare module 'zod/v4/core' {
  interface GlobalMeta {
    visibility?: FieldVisibility
  }
}
