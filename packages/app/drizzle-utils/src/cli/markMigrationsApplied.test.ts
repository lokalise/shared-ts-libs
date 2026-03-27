import { resolve } from 'node:path'
import { execCommand } from 'cli-testlab'
import { describe, it } from 'vitest'

const CLI_PATH = resolve(__dirname, 'markMigrationsApplied.ts')
const FIXTURES_DIR = resolve(__dirname, '../../test/fixtures')
const CLI = `node --experimental-strip-types ${CLI_PATH}`

describe('mark-migrations-applied CLI', () => {
  describe('argument validation', () => {
    it('shows usage and exits with error when no arguments provided', async () => {
      await execCommand(CLI, {
        expectedErrorMessage: 'Usage:',
      })
    })

    it('shows help with --help flag', async () => {
      await execCommand(`${CLI} --help`, {
        expectedOutput: ['Usage:', '--help'],
      })
    })

    it('shows help with -h flag', async () => {
      await execCommand(`${CLI} -h`, {
        expectedOutput: 'Usage:',
      })
    })
  })

  describe('config validation', () => {
    it('exits with error for unsupported dialect', async () => {
      await execCommand(`${CLI} ${FIXTURES_DIR}/drizzle-invalid-dialect.config.ts`, {
        expectedErrorMessage: 'Unsupported or missing dialect',
      })
    })

    it('exits with error when dbCredentials is missing', async () => {
      await execCommand(`${CLI} ${FIXTURES_DIR}/drizzle-no-credentials.config.ts`, {
        expectedErrorMessage: 'Missing dbCredentials',
      })
    })

    it('exits with error for non-existent config file', async () => {
      await execCommand(`${CLI} ./nonexistent.config.ts`, {
        expectedErrorMessage: 'nonexistent',
      })
    })
  })

  describe('PostgreSQL integration', () => {
    it('marks migrations as applied', async () => {
      await execCommand(`${CLI} ${FIXTURES_DIR}/drizzle-pg-url.config.ts`, {
        expectedOutput: ['Dialect: postgresql', 'Done', '0000_init', '0001_add_users'],
        env: { DATABASE_URL: process.env.DATABASE_URL },
      })
    })

    it('is idempotent — skips already applied migrations on second run', async () => {
      await execCommand(`${CLI} ${FIXTURES_DIR}/drizzle-pg-url.config.ts`, {
        expectedOutput: ['Skipped: 2'],
        env: { DATABASE_URL: process.env.DATABASE_URL },
      })
    })
  })

  describe('MySQL integration', () => {
    it('marks migrations as applied', async () => {
      await execCommand(`${CLI} ${FIXTURES_DIR}/drizzle-mysql-url.config.ts`, {
        expectedOutput: ['Dialect: mysql', 'Done', '0000_init'],
        env: { MYSQL_DATABASE_URL: process.env.MYSQL_DATABASE_URL },
      })
    })

    it('is idempotent — skips already applied migrations on second run', async () => {
      await execCommand(`${CLI} ${FIXTURES_DIR}/drizzle-mysql-url.config.ts`, {
        expectedOutput: ['Skipped: 1'],
        env: { MYSQL_DATABASE_URL: process.env.MYSQL_DATABASE_URL },
      })
    })
  })
})
