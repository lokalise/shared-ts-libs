import type { ODataBinds } from '@balena/odata-parser'
import odataParser from '@balena/odata-parser'

import { ODataParseError } from './errors.ts'
import type { AstNode, ParsedFilter } from './types.ts'

const { parse } = odataParser

const PARSE_OPTIONS = {
  startRule: 'ProcessRule' as const,
  rule: 'QueryOptions' as const,
}

const EMPTY_BINDS = [] as unknown as ODataBinds

export function parseFilterQuery(filterQuery: string): ParsedFilter {
  const trimmed = filterQuery.trim()
  if (trimmed === '') {
    throw new ODataParseError('Filter expression must not be empty or whitespace-only', filterQuery)
  }

  try {
    const { tree, binds } = parse(`$filter=${trimmed}`, PARSE_OPTIONS)
    const filterTree = tree?.$filter as AstNode | undefined

    if (filterTree === undefined || filterTree === null) {
      throw new ODataParseError('No filter expression found in input', filterQuery)
    }

    return {
      tree: filterTree,
      binds: binds ?? EMPTY_BINDS,
    }
  } catch (error) {
    if (error instanceof ODataParseError) {
      throw error
    }
    throw new ODataParseError(
      `Invalid OData $filter expression: ${trimmed}`,
      filterQuery,
      error instanceof Error ? error : undefined,
    )
  }
}
