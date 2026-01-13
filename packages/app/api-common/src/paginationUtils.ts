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

/**
 * Internal helper to construct PaginationMeta for a page of data.
 */
const getMetaForNextPage = <T extends Record<string, unknown>, K extends keyof T>(
  currentPageData: T[],
  pageLimit: number,
  cursorKeys: K[] | undefined,
): PaginationMeta => {
  if (cursorKeys && cursorKeys.length === 0) {
    throw new Error('cursorKeys cannot be an empty array')
  }

  if (currentPageData.length === 0) return { count: 0, hasMore: false }

  const count = Math.min(currentPageData.length, pageLimit)
  const lastElement = currentPageData[count - 1] as T

  let cursor: string
  if (!cursorKeys) {
    cursor = (lastElement as unknown as { id: string }).id
  } else if (cursorKeys.length === 1) {
    // biome-ignore lint/style/noNonNullAssertion: checked above
    const value = lastElement[cursorKeys[0]!]
    cursor =
      typeof value === 'string' || typeof value === 'number'
        ? value.toString()
        : encodeCursor(value as Record<string, unknown>)
  } else {
    cursor = encodeCursor(pick(lastElement, cursorKeys))
  }

  return {
    count,
    cursor,
    hasMore: currentPageData.length > pageLimit,
  }
}

/**
 * Constructs a PaginatedResponse object with the current page respecting page limit and building meta to retrieve next page.
 *
 * @param page - Current page of objects which will be included in `data`. It will be sliced to pageLimit.
 * @param pageLimit - The maximum number of items to include in the current page.
 * 	- If page length is less than or equal to pageLimit, hasMore will be set to false (no more items to fetch).
 * 	- If page length is greater than pageLimit, the data will be sliced to pageLimit and hasMore will be set to true.
 * @param cursorKeys - An optional array of keys that determine the formation of the cursor. By default, uses the 'id' property.
 *  - If not provided, the cursor will use the 'id' property of the last element in 'data'.
 *  - If a single key is provided and its value is a string or number, the cursor will be that value converted to string (not encoded).
 *  - If a single key is provided but its value is neither string nor number, or if multiple keys are provided,
 *    the cursor will be an encoded string incorporating the values.
 *  - Empty arrays will throw an error.
 *
 * @returns PaginatedResponse - An object containing the paginated data and metadata with cursor and hasMore flag.
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
