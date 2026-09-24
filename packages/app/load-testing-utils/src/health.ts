const sleep = (ms: number) => new Promise<void>((done) => setTimeout(done, ms))

export type WaitForHealthOptions = {
  /** @default 180_000 */
  timeoutMs?: number
  /** @default 1000 */
  intervalMs?: number
  /** Appended to the timeout error, for example where the logs are. */
  hint?: string
  /** Where progress goes. Defaults to stdout. */
  write?: (text: string) => void
}

/** Polls `url` until it answers 2xx, and throws once `timeoutMs` has passed. */
export async function waitForHealth(
  name: string,
  url: string,
  options: WaitForHealthOptions = {},
): Promise<void> {
  const { timeoutMs = 180_000, intervalMs = 1000, hint } = options
  const write = options.write ?? ((text: string) => process.stdout.write(text))
  const deadline = Date.now() + timeoutMs

  write(`[runner] waiting for ${name} at ${url} `)
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2000) })
      if (response.ok) {
        write('ok\n')
        return
      }
    } catch {
      // A refused connection is the normal first few seconds.
    }
    write('.')
    await sleep(intervalMs)
  }
  write('\n')
  throw new Error(
    `${name} did not become healthy within ${timeoutMs / 1000}s${hint ? `; ${hint}` : ''}`,
  )
}

export type RefuseIfPortTakenOptions = {
  /** @default '/health' */
  path?: string
  /** Appended to the error, for example the flag that skips starting this process. */
  hint?: string
}

/**
 * Throws when something already answers HTTP on `port`.
 *
 * Without this the failure is invisible: the process about to start dies on
 * EADDRINUSE, the health check passes against whatever was there first, and the
 * run measures a process from an earlier session.
 */
export async function refuseIfPortTaken(
  name: string,
  port: number,
  options: RefuseIfPortTakenOptions = {},
): Promise<void> {
  const { path = '/health', hint } = options
  try {
    await fetch(`http://localhost:${port}${path}`, { signal: AbortSignal.timeout(500) })
  } catch {
    return
  }
  throw new Error(
    `something already answers on :${port}, which is ${name}'s port. Stop it first${hint ? `, or ${hint}` : ''}.`,
  )
}
