import { assertSupportedTree, matchesFilter } from './evaluate.ts'
import { parseFilterQuery } from './parser.ts'
import type { EvalContext, FilterOptions, FilterResult } from './types.ts'

export function filterObjects(
  filterQuery: string,
  objects: Record<string, unknown>[],
  options: FilterOptions = {},
): FilterResult {
  const { tree, binds } = parseFilterQuery(filterQuery)
  assertSupportedTree(tree, filterQuery)

  const limit = options.limit
  const items: Record<string, unknown>[] = []
  let matchCount = 0
  let truncated = false

  const ctx: EvalContext = {
    root: {},
    parserBinds: binds,
    aliasBinds: options.binds ?? {},
    filter: filterQuery,
  }

  for (const object of objects) {
    ctx.root = object
    if (matchesFilter(ctx, tree)) {
      matchCount++
      if (limit === undefined || items.length < limit) {
        items.push(object)
      }
    }
  }

  if (limit !== undefined && matchCount > limit) {
    truncated = true
  }

  return { items, truncated }
}
