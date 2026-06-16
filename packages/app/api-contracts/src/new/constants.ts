/**
 * @deprecated Prefer plain values that carry the same intent:
 * - As a request body sentinel (`requestBodySchema`), use `null`.
 * - As a no-body response entry (`responsesByStatusCode`), use {@link noBodyResponse}.
 *
 *  Will be removed in a future major release.
 */
export const ContractNoBody = Symbol.for('ContractNoBody')
