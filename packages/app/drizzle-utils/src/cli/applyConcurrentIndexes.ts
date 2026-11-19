#!/usr/bin/env node

import { resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { applyConcurrentIndexes } from '../applyConcurrentIndexes.ts'
import { buildConnectionUrl, loadConfig } from './drizzleConfig.ts'

// biome-ignore lint/suspicious/noConsole: CLI script — console is the intended output channel
const log = console.log
// biome-ignore lint/suspicious/noConsole: CLI script — console is the intended output channel
const logError = console.error

function printUsage(exitCode: number): never {
  const out = exitCode === 0 ? log : logError
  out('Usage: npx apply-concurrent-indexes <path-to-drizzle.config.ts> --folder <dir>')
  out()
  out('Builds every index in <dir> with CREATE INDEX CONCURRENTLY before drizzle-kit migrate.')
  out('Valid indexes are skipped and INVALID ones are rebuilt. PostgreSQL only.')
  out()
  out('Options:')
  out('  --folder <dir>  Folder with CREATE INDEX CONCURRENTLY IF NOT EXISTS .sql files')
  out('  --help, -h      Show this help message')
  process.exit(exitCode)
}

function parseCliArgs(): { configPath: string; folder: string } {
  const { values, positionals } = parseArgs({
    args: process.argv.slice(2),
    options: {
      help: { type: 'boolean', short: 'h' },
      folder: { type: 'string' },
    },
    allowPositionals: true,
    strict: false,
  })

  if (values.help) {
    printUsage(0)
  }

  const configPath = positionals.at(-1)
  if (!configPath || typeof values.folder !== 'string') {
    printUsage(1)
  }

  return { configPath, folder: values.folder }
}

async function main() {
  const { configPath, folder } = parseCliArgs()

  const absolutePath = resolve(configPath)
  log(`Loading config from ${absolutePath}`)
  const { dialect, dbCredentials } = await loadConfig(absolutePath)

  if (dialect !== 'postgresql') {
    logError(`Unsupported dialect: "${dialect}". Supported: postgresql`)
    process.exit(1)
  }

  if (!dbCredentials) {
    logError('Missing dbCredentials in drizzle config')
    process.exit(1)
  }

  const indexFolder = resolve(folder)
  log(`Index folder: ${indexFolder}`)

  const pg = await import('postgres')
  const { drizzle } = await import('drizzle-orm/postgres-js')
  const sql = pg.default(buildConnectionUrl(dbCredentials, dialect))

  try {
    await applyConcurrentIndexes({ db: drizzle({ client: sql }), folder: indexFolder, log })
  } finally {
    await sql.end()
  }
}

main().catch((err) => {
  logError(err instanceof Error ? err.message : err)
  if (err instanceof Error && err.cause) {
    logError(err.cause)
  }
  process.exit(1)
})
