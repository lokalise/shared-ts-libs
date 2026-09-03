/**
 * Diffs two lists as multisets (order-independent, duplicates counted): every entry of `current`
 * consumes an identical unpaired entry of `reference`. Unpaired reference entries are returned as
 * `missing`, unpaired current entries as `added`.
 */
export const multisetDiff = (
  reference: string[],
  current: string[],
): { missing: string[]; added: string[] } => {
  const unpairedReference = new Map<string, number>()
  for (const entry of reference) {
    unpairedReference.set(entry, (unpairedReference.get(entry) ?? 0) + 1)
  }

  const added: string[] = []
  for (const entry of current) {
    const count = unpairedReference.get(entry) ?? 0
    if (count > 0) unpairedReference.set(entry, count - 1)
    else added.push(entry)
  }

  const missing: string[] = []
  for (const [entry, count] of unpairedReference) {
    missing.push(...Array.from({ length: count }, () => entry))
  }

  return { missing, added }
}
