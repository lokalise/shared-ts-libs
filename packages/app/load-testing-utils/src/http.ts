/** The body of a 2xx answer, or `undefined` for anything else, including no answer at all. */
export async function fetchText(url: string, timeoutMs = 5000): Promise<string | undefined> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) })
    return response.ok ? await response.text() : undefined
  } catch {
    return undefined
  }
}

/** {@link fetchText}, parsed. A body that is not JSON is `undefined` too. */
export async function fetchJson<T>(url: string, timeoutMs = 5000): Promise<T | undefined> {
  const text = await fetchText(url, timeoutMs)
  if (text === undefined) return undefined
  try {
    return JSON.parse(text) as T
  } catch {
    return undefined
  }
}
