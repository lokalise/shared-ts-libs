#!/usr/bin/env node

import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import type { Dialect, SqlExecutor } from '../markMigrationsApplied.ts'
import { markMigrationsApplied } from '../markMigrationsApplied.ts'

interface DrizzleDbCredentials {
  url?: string
  host?: string
  port?: number
  user?: string
  password?: string
  database?: string
}

interface DrizzleConfig {
  dialect?: string
  out?: string
  dbCredentials?: DrizzleDbCredentials
}

const SUPPORTED_DIALECTS = new Set(['postgresql', 'mysql', 'cockroachdb'])

// biome-ignore lint/suspicious/noConsole: CLI script — console is the intended output channel
const log = console.log
// biome-ignore lint/suspicious/noConsole: CLI script — console is the intended output channel
const logError = console.error

async function loadConfig(configPath: string): Promise<DrizzleConfig> {
  const mod = (await import(pathToFileURL(configPath).href)) as
    | { default?: DrizzleConfig }
    | DrizzleConfig
  return ('default' in mod && mod.default ? mod.default : mod) as DrizzleConfig
}

function buildConnectionUrl(credentials: DrizzleDbCredentials, dialect: string): string {
  if (credentials.url) {
    return credentials.url
  }

  if (!credentials.host || !credentials.database) {
    throw new Error('dbCredentials must have either "url" or at least "host" and "database" fields')
  }

  const scheme = dialect === 'mysql' ? 'mysql' : 'postgresql'
  const userPart = credentials.user
    ? `${credentials.user}${credentials.password ? `:${credentials.password}` : ''}@`
    : ''
  const port = credentials.port ? `:${credentials.port}` : ''

  return `${scheme}://${userPart}${credentials.host}${port}/${credentials.database}`
}

async function createPostgresExecutor(
  url: string,
): Promise<{ executor: SqlExecutor; close: () => Promise<void> }> {
  const pg = await import('postgres')
  const sql = pg.default(url)
  return {
    executor: {
      run: (query: string) => sql.unsafe(query).then(() => {}),
      all: (query: string) => sql.unsafe(query) as Promise<Record<string, unknown>[]>,
    },
    close: () => sql.end(),
  }
}

async function createMysqlExecutor(
  url: string,
): Promise<{ executor: SqlExecutor; close: () => Promise<void> }> {
  const mysql = await import('mysql2/promise')
  const connection = await mysql.createConnection(url)
  return {
    executor: {
      run: (query: string) => connection.execute(query).then(() => {}),
      all: (query: string) =>
        connection.execute(query).then(([rows]) => rows as Record<string, unknown>[]),
    },
    close: () => connection.end(),
  }
}

function printUsage(exitCode: number): never {
  const out = exitCode === 0 ? log : logError
  out('Usage: npx mark-migrations-applied <path-to-drizzle.config.ts>')
  out('       npx -p @lokalise/drizzle-utils mark-migrations-applied <path-to-drizzle.config.ts>')
  out()
  out('Reads your drizzle config to establish a migration baseline.')
  out('All existing migrations are marked as applied without executing them.')
  out()
  out('Options:')
  out('  --help, -h  Show this help message')
  process.exit(exitCode)
}

function parseCliArgs(): { configPath: string } {
  const { values, positionals } = parseArgs({
    args: process.argv.slice(2),
    options: {
      help: { type: 'boolean', short: 'h' },
    },
    allowPositionals: true,
    strict: false,
  })

  if (values.help) {
    printUsage(0)
  }

  // When invoked via `npx @lokalise/drizzle-utils mark-migrations-applied ./config.ts`,
  // npx passes the bin name as a positional arg too. Use the last positional to be resilient.
  const configPath = positionals.at(-1)
  if (!configPath) {
    printUsage(1)
  }

  return { configPath }
}

function validateConfig(config: DrizzleConfig): {
  dialect: Dialect
  dbCredentials: DrizzleDbCredentials
} {
  const { dialect, dbCredentials } = config

  if (!dialect || !SUPPORTED_DIALECTS.has(dialect)) {
    logError(
      `Unsupported or missing dialect: "${dialect}". Supported: postgresql, mysql, cockroachdb`,
    )
    process.exit(1)
  }

  if (!dbCredentials) {
    logError('Missing dbCredentials in drizzle config')
    process.exit(1)
  }

  return { dialect: dialect as Dialect, dbCredentials }
}

async function main() {
  const { configPath } = parseCliArgs()

  const absolutePath = resolve(configPath)
  log(`Loading config from ${absolutePath}`)
  const config = await loadConfig(absolutePath)

  const { dialect, dbCredentials } = validateConfig(config)
  const url = buildConnectionUrl(dbCredentials, dialect)
  const migrationsFolder = resolve(config.out ?? './drizzle')

  log(`Dialect: ${dialect}`)
  log(`Migrations folder: ${migrationsFolder}`)

  const createExecutor = {
    postgresql: createPostgresExecutor,
    cockroachdb: createPostgresExecutor,
    mysql: createMysqlExecutor,
  }[dialect]

  if (!createExecutor) {
    throw new Error(`No executor available for dialect "${dialect}"`)
  }

  const { executor, close } = await createExecutor(url)

  try {
    const result = await markMigrationsApplied({
      migrationsFolder,
      executor,
      dialect,
    })

    log()
    log(`Done — Applied: ${result.applied}, Skipped: ${result.skipped}`)
    for (const entry of result.entries) {
      const marker = entry.status === 'applied' ? '+' : '='
      log(`  ${marker} ${entry.tag}`)
    }
  } finally {
    await close()
  }
}

main().catch((err) => {
  logError(err instanceof Error ? err.message : err)
  process.exit(1)
})
