import { resolve } from 'node:path'
import { execCommand } from 'cli-testlab'
import { describe, it } from 'vitest'

const CLI_PATH = resolve(__dirname, 'applyConcurrentIndexes.ts')
const FIXTURES_DIR = resolve(__dirname, '../../test/fixtures')
const CLI = `node --experimental-strip-types ${CLI_PATH}`
const FOLDER_ARG = `--folder ${FIXTURES_DIR}/concurrent-indexes`

describe('apply-concurrent-indexes CLI', () => {
  it('shows usage and exits with error when no arguments provided', async () => {
    await execCommand(CLI, { expectedErrorMessage: 'Usage:' })
  })

  it('shows usage and exits with error when --folder is missing', async () => {
    await execCommand(`${CLI} ${FIXTURES_DIR}/drizzle-pg-url.config.ts`, {
      expectedErrorMessage: 'Usage:',
    })
  })

  it('shows help with --help flag', async () => {
    await execCommand(`${CLI} --help`, { expectedOutput: ['Usage:', '--folder'] })
  })

  it('exits with error for a dialect other than postgresql', async () => {
    await execCommand(`${CLI} ${FOLDER_ARG} ${FIXTURES_DIR}/drizzle-mysql-url.config.ts`, {
      expectedErrorMessage: 'Unsupported dialect',
    })
  })

  it('exits with error when dbCredentials is missing', async () => {
    await execCommand(`${CLI} ${FOLDER_ARG} ${FIXTURES_DIR}/drizzle-no-credentials.config.ts`, {
      expectedErrorMessage: 'Missing dbCredentials',
    })
  })

  it('applies the index folder against PostgreSQL', async () => {
    await execCommand(`${CLI} ${FOLDER_ARG} ${FIXTURES_DIR}/drizzle-pg-url.config.ts`, {
      expectedOutput: ['Index folder:', 'Concurrent indexes:', '3 skipped (of 3 total)'],
      env: { DATABASE_URL: process.env.DATABASE_URL },
    })
  })
})
