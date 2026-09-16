#!/usr/bin/env node
/**
 * The `pyroscope-analyze` executable. Everything it does lives in
 * `analyzeCommand.mjs`, which holds no side effect, so the command can be
 * tested without running it as a process.
 */

/* biome-ignore-all lint/suspicious/noConsole: this is a CLI */

import { main } from './analyzeCommand.mjs'

// An exit code rather than process.exit(), which would drop whatever of the
// output is still buffered on a pipe.
main()
  .then((code) => {
    process.exitCode = code
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
