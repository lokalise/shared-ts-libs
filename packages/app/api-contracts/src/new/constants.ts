/**
 * Sentinel marking that a POST/PUT/PATCH contract takes **no request body**.
 *
 * Used as a `requestBodySchema` value. Since `requestBodySchema` is required for payload methods,
 * this makes "no body" an explicit choice rather than an omission. It is a request-only sentinel
 * and cannot be used as a `responsesByStatusCode` entry.
 *
 * @example
 * defineApiContract({
 *   summary: 'Trigger reindex',
 *   method: 'post',
 *   requestBodySchema: ContractNoBody,
 *   pathResolver: () => '/reindex',
 *   responsesByStatusCode: { 202: z.object({ jobId: z.string() }) },
 * })
 */
export const ContractNoBody = Symbol.for('ContractNoBody')
