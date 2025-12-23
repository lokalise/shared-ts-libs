import type { ODataBinds } from '@balena/odata-parser'

/**
 * Creates an ODataBinds array with proper type that satisfies TypeScript.
 * This is needed because ODataBinds extends Array with an index signature for parameter aliases.
 */
export function createBinds(binds: Array<[string, unknown]>): ODataBinds {
  return binds as unknown as ODataBinds
}

/**
 * Creates an ODataBinds array with parameter aliases.
 */
export function createBindsWithAliases(
  binds: Array<[string, unknown]>,
  aliases: Record<`@${string}`, [string, unknown]>,
): ODataBinds {
  const result = binds as unknown as ODataBinds
  for (const [key, value] of Object.entries(aliases)) {
    result[key as `@${string}`] = value
  }
  return result
}
