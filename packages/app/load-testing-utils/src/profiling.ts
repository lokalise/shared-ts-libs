const WINDOWS_NOTES =
  'https://github.com/lokalise/shared-ts-libs/tree/main/packages/app/pyroscope-profiling#on-a-windows-dev-box'

export type RefuseProfilingOnWindowsOptions = {
  /** @default process.platform */
  platform?: NodeJS.Platform
  /** Appended to the way out, for example the flag that skips starting this process. */
  hint?: string
}

/**
 * Throws on Windows, for a runner about to start `name` with the profiler on.
 *
 * `@pyroscope/nodejs` cannot start there (`@datadog/pprof` builds without the
 * labelled wall profiler on Windows), so the process logs the failure and runs
 * unprofiled, and Pyroscope stays up with nothing in it.
 */
export function refuseProfilingOnWindows(
  name: string,
  options: RefuseProfilingOnWindowsOptions = {},
): void {
  const { platform = process.platform, hint } = options
  if (platform !== 'win32') return

  throw new Error(
    [
      `cannot profile ${name} started on Windows: @pyroscope/nodejs fails there with "Contexts are not supported."`,
      `Run the runner from WSL2 instead, or start ${name} yourself in WSL2 or its container${hint ? ` and ${hint}` : ''}.`,
      `See ${WINDOWS_NOTES}`,
    ].join('\n'),
  )
}
