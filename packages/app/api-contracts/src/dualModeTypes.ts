/**
 * Response mode determined by Accept header.
 */
export type DualModeType = 'json' | 'sse'

/**
 * Minimal logger interface for dual-mode route error handling.
 * Compatible with CommonLogger from @lokalise/node-core and pino loggers.
 */
export type DualModeLogger = {
  error: (obj: Record<string, unknown>, msg: string) => void
}

/**
 * Configuration options for dual-mode controllers.
 */
export type DualModeControllerConfig = {
  /**
   * Enable connection spying for testing.
   * When enabled, the controller tracks connections and allows waiting for them.
   * Only enable this in test environments.
   * @default false
   */
  enableConnectionSpy?: boolean
}
