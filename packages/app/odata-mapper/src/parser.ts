import type { ODataBinds } from '@balena/odata-parser'
import { parse } from '@balena/odata-parser'
import type { FilterTreeNode } from './types.ts'

/**
 * Custom error for OData parsing failures.
 * Provides structured error information including the original filter string.
 */
export class ODataParseError extends Error {
  public readonly filter: string
  public override readonly cause?: Error

  constructor(message: string, filter: string, cause?: Error) {
    super(message)
    this.name = 'ODataParseError'
    this.filter = filter
    this.cause = cause
  }
}

/**
 * Parsed OData filter result
 */
export interface ParsedODataFilter {
  /** The parsed filter AST, or null if no filter provided */
  tree: FilterTreeNode | null
  /** Binds array containing resolved primitive values */
  binds: ODataBinds
  /** The original filter string */
  originalFilter: string | undefined
}

/**
 * Parse an OData $filter expression using @balena/odata-parser.
 *
 * This is a convenience wrapper that handles:
 * - Null/empty filter strings gracefully
 * - URL construction required by the parser
 * - Error wrapping with structured ODataParseError
 *
 * @param filter - The OData $filter string (e.g., "status eq 'active'")
 * @returns Parsed filter result with tree and binds
 * @throws ODataParseError if the filter is invalid
 *
 * @example
 * ```typescript
 * const result = parseODataFilter("status eq 'active'")
 * // result.tree contains the parsed expression tree
 * // result.binds contains the bound values
 *
 * // Use with transformFilter for high-level access
 * if (result.tree) {
 *   const filter = transformFilter(result.tree, result.binds)
 *   const status = extractEqualityValue(filter, 'status')
 * }
 * ```
 */
// Empty binds constant typed correctly
const EMPTY_BINDS = [] as unknown as ODataBinds

export function parseODataFilter(filter: string | undefined): ParsedODataFilter {
  if (!filter || filter.trim() === '') {
    return { tree: null, binds: EMPTY_BINDS, originalFilter: filter }
  }

  try {
    // @balena/odata-parser expects a full OData URL path format
    // We use a dummy resource path to satisfy the parser
    const { tree, binds } = parse(`/resource?$filter=${filter}`)

    // The filter is in tree.options.$filter
    const filterTree = tree?.options?.$filter as FilterTreeNode | undefined

    return {
      tree: filterTree ?? null,
      binds: binds ?? EMPTY_BINDS,
      originalFilter: filter,
    }
  } catch (error) {
    throw new ODataParseError(
      `Invalid OData $filter expression: ${filter}`,
      filter,
      error instanceof Error ? error : undefined,
    )
  }
}
