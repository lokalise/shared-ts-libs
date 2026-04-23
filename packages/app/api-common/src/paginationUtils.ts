import type { OptionalPaginationParams, PaginatedResponse, PaginationMeta } from './apiSchemas.ts'
import { encodeCursor } from './cursorCodec.ts'

const pick = <T, K extends string | number | symbol>(
  source: T,
  propNames: readonly K[],
): Pick<T, Exclude<keyof T, Exclude<keyof T, K>>> => {
  const result = {} as T
  let idx = 0
  while (idx < propNames.length) {
    // @ts-expect-error
    if (propNames[idx] in source) {
      // @ts-expect-error
      result[propNames[idx]] = source[propNames[idx]]
    }
    idx += 1
  }
  return result
}

const getMetaForNextPage = <T extends Record<string, unknown>, K extends keyof T>(
  currentPageData: T[],
  pageLimit: number,
  cursorKeys?: K[],
): PaginationMeta => {
  if (cursorKeys !== undefined && cursorKeys.length === 0) {
    throw new Error('cursorKeys cannot be an empty array')
  }
  if (currentPageData.length === 0) {
    return { resultCount: 0, hasMore: false }
  }

  const resultCount = Math.min(currentPageData.length, pageLimit)

  const lastElement = currentPageData[resultCount - 1] as T
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
    resultCount,
    cursor,
    hasMore: currentPageData.length > pageLimit,
  }
}

/**
 * Constructs a PaginatedResponse object with the current page respecting page limit and building meta to retrieve next page.
 *
 * @param page - Current page of objects which will be included in `data`. It will be sliced to pageLimit.
 * @param pageLimit - Expected count of items in the current page.
 * 	- If page length is less than or equal to pageLimit, it means that there are no more items to fetch.
 * 		In that case, hasMore flag will be set to false. Otherwise, hasMore flag will be set to true.
 * 		If page length is greater than pageLimit, it will be sliced and resultCount will be set to pageLimit.
 * @param cursorKeys - An optional array of keys that determine the formation of the cursor. By default, this uses
 *    the 'id' property.
 *  - If 'cursorKeys' is undefined, the cursor will default to the 'id' property of the last element in 'data'.
 *  - If 'cursorKeys' contains a single key, the cursor will correspond to the value of that key from the last element
 *    in 'data'.
 *  - If 'cursorKeys' features multiple keys, the cursor will be an encoded string incorporating the values of these
 *    keys from the last element in 'data'.
 *
 * @returns PageResponse
 */
export function createPaginatedResponse<T extends { id: string }>(
  page: T[],
  pageLimit: number,
  cursorKeys?: undefined,
): PaginatedResponse<T>
export function createPaginatedResponse<T extends Record<string, unknown>, K extends keyof T>(
  page: T[],
  pageLimit: number,
  cursorKeys: K[],
): PaginatedResponse<T>
export function createPaginatedResponse<T extends Record<string, unknown>, K extends keyof T>(
  page: T[],
  pageLimit: number,
  cursorKeys?: K[],
): PaginatedResponse<T> {
  return {
    data: page.slice(0, pageLimit),
    meta: getMetaForNextPage(page, pageLimit, cursorKeys),
  }
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
export const getPaginatedEntries = async <T extends Record<string, unknown>>(
  pagination: OptionalPaginationParams,
  apiCall: (params: OptionalPaginationParams) => Promise<PaginatedResponse<T>>,
): Promise<T[]> => {
  const resultArray: T[] = []
  let hasMore = true
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
