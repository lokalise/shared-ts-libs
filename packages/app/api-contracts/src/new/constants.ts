/**
 * Sentinel marking that a POST/PUT/PATCH contract takes **no request body**.
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
