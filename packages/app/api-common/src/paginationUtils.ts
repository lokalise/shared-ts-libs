import type { OptionalPaginationParams, PaginatedResponse, PaginationMeta } from './apiSchemas.ts'
import { encodeCursor } from './cursorCodec.ts'

const pick = <T, K extends string | number | symbol>(
  source: T,
  propNames: readonly K[],
): Pick<T, Exclude<keyof T, Exclude<keyof T, K>>> => {
  const result = {} as T
  let idx = 0
  while (idx < propNames.length) {
    // @ts-ignore
    if (propNames[idx] in source) {
      // @ts-ignore
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      result[propNames[idx]] = source[propNames[idx]]
    }
    idx += 1
  }
  return result
}

/**
 * @deprecated use `createPaginatedResponse` instead
 *
 * Constructs a PaginationMeta object encapsulating the total count and the cursor for fetching the next page.
 *
 * The resultant cursor can be either a simple string or an encoded string based on the 'cursorKeys' parameter.
 * 	- If 'cursorKeys' is undefined, the cursor will default to the 'id' property of the last element in 'data'.
 * 	- If 'cursorKeys' contains a single key, the cursor will correspond to the value of that key from the last element
 * 		in 'data'.
 * 	- If 'cursorKeys' features multiple keys, the cursor will be an encoded string incorporating the values of these
 * 		keys from the last element in 'data'.
 *
 * @param currentPageData - A generic array of objects, each object expected to extend { id: string }.
 * @param cursorKeys - An optional array of keys that determine the formation of the cursor. By default, this uses
 * 	the 'id' property.
 * @param pageLimit - An optional number that can be used to specify the expected count of items in the current page.
 * 	- If it is provided and currentPageData length is less than or equal to pageLimit, it means that there are no more items to fetch.
 * 		In that case, hasMore flag will be set to false. Otherwise, hasMore flag will be set to true.
 * 		If currentPageData length is greater than pageLimit, count will be set to pageLimit.
 * 	- If the parameter is not provided, hasMore flag will be undefined.
 *
 * @returns PaginationMeta - An object detailing two crucial properties required for effective pagination: total item
 * 	count, the cursor and has more flag.
 */
export function getMetaForNextPage<T extends { id: string }>(
  currentPageData: T[],
  cursorKeys?: undefined,
  pageLimit?: number,
): PaginationMeta
export function getMetaForNextPage<T extends Record<string, unknown>, K extends keyof T>(
  currentPageData: T[],
  cursorKeys: K[],
  pageLimit?: number,
): PaginationMeta
export function getMetaForNextPage<T extends Record<string, unknown>, K extends keyof T>(
  currentPageData: T[],
  cursorKeys?: K[],
  pageLimit?: number,
): PaginationMeta {
  if (cursorKeys !== undefined && cursorKeys.length === 0) {
    throw new Error('cursorKeys cannot be an empty array')
  }
  if (currentPageData.length === 0) {
    return { count: 0, hasMore: false }
  }

  const count = pageLimit ? Math.min(currentPageData.length, pageLimit) : currentPageData.length

  const lastElement = currentPageData[count - 1] as T
  let cursor: string
  if (!cursorKeys) {
    cursor = lastElement.id as string
  } else {
    cursor =
      cursorKeys.length === 1
        ? (lastElement[cursorKeys[0] as K] as string)
        : encodeCursor(pick(lastElement, cursorKeys))
  }

  return {
    count,
    cursor,
    hasMore: pageLimit ? currentPageData.length > pageLimit : undefined,
  }
}

/**
 * Constructs a PaginatedResponse object with the current page respecting page limit and building meta to retrieve next page.
 *
 * @param page - Current page of objects which will be included in `data`. It will be sliced to pageLimit if provided
 * @param pageLimit - An optional number that can be used to specify the expected count of items in the current page.
 * 	- If it is provided and page length is less than or equal to pageLimit, it means that there are no more items to fetch.
 * 		In that case, hasMore flag will be set to false. Otherwise, hasMore flag will be set to true.
 * 		If currentPageData length is greater than pageLimit, it will be sliced and count will be set to pageLimit.
 * 	- If the parameter is not provided, hasMore flag will be undefined.
 * @param cursorKeys - An optional array of keys that determine the formation of the cursor. By default, this uses
 *    the 'id' property.
 *  - If 'cursorKeys' is undefined, the cursor will default to the 'id' property of the last element in 'data'.
 *  - If 'cursorKeys' contains a single key, the cursor will correspond to the value of that key from the last element
 *    in 'data'.
 *  - If 'cursorKeys' features multiple keys, the cursor will be an encoded string incorporating the values of these
 *    keys from the last element in 'data'.
 *
 * @returns PageResponse
 *
 * Note: `hasMore` flag will be undefined if `pageLimit` is not provided, please read the param doc for more details.
 */
export function createPaginatedResponse<T extends { id: string }>(
  page: T[],
  pageLimit: number | undefined,
  cursorKeys?: undefined,
): PaginatedResponse<T>
export function createPaginatedResponse<T extends Record<string, unknown>, K extends keyof T>(
  page: T[],
  pageLimit: number | undefined,
  cursorKeys: K[],
): PaginatedResponse<T>

/**
 * @deprecated use other versions of {@link createPaginatedResponse}
 *
 * @param page
 * @param pageLimit
 * @param cursorKeys
 */
export function createPaginatedResponse<T extends Record<string, unknown>, K extends keyof T>(
  page: T[],
  pageLimit?: number,
  cursorKeys?: K[],
): PaginatedResponse<T> {
  return {
    data: page.slice(0, pageLimit),
    // @ts-ignore -> on next major version, we can simplify getMetaForNextPage signature and remove ts-ignore
    meta: getMetaForNextPage(page, cursorKeys, pageLimit),
  }
}

/**
 * @deprecated use {@link getPaginatedEntriesByHasMore}
 *
 * This function will collect all paginated entries based on returned 'cursor'.
 * For function to behave correctly the last result should have 'cursor === undefined'.
 *
 * @param pagination
 * @param apiCall
 *
 * @example
 * &lt;caption>Example usage of method&lt;/caption>
 * await getPaginatedEntries({ limit: 1 }, (params) => {
 *                return market.getApples(params)
 *            }
 */
export async function getPaginatedEntries<T extends Record<string, unknown>>(
  pagination: OptionalPaginationParams,
  apiCall: (params: OptionalPaginationParams) => Promise<PaginatedResponse<T>>,
): Promise<T[]> {
  const resultArray: T[] = []
  let currentCursor: string | undefined
  do {
    const pageResult = await apiCall({
      ...(pagination.limit ? { limit: pagination.limit } : {}),
      ...(currentCursor ? { after: currentCursor } : {}),
    })
    resultArray.push(...pageResult.data)
    currentCursor = pageResult.meta.cursor
  } while (currentCursor)

  return resultArray
}

/**
 * This function will collect all paginated entries based on returned 'cursor' and 'hasMore' fields.
 *
 * For better experience should be used in combine with {@link createPaginatedResponse} function.
 *
 * @param pagination
 * @param apiCall
 *
 * @example
 * <caption>Example of usage with limit</caption>
 * await getPaginatedEntries({ limit: 1 }, (params) => {
 *                return market.getApples(params)
 *            }
 *
 * <caption>Example of usage with limit and start cursor</caption>
 * await getPaginatedEntries({ limit: 1, after: 'red' }, (params) => {
 *                return market.getApples(params)
 *            }
 */
export async function getPaginatedEntriesByHasMore<T extends Record<string, unknown>>(
  pagination: OptionalPaginationParams,
  apiCall: (params: OptionalPaginationParams) => Promise<PaginatedResponse<T>>,
): Promise<T[]> {
  const resultArray: T[] = []
  let hasMore: boolean | undefined
  let currentCursor: string | undefined = pagination.after
  do {
    const pageResult = await apiCall({
      ...(pagination.limit ? { limit: pagination.limit } : {}),
      ...(currentCursor ? { after: currentCursor } : {}),
    })
    resultArray.push(...pageResult.data)
    hasMore = pageResult.meta.hasMore
    currentCursor = pageResult.meta.cursor
  } while (hasMore)

  return resultArray
}
