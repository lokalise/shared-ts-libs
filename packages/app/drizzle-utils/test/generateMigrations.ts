import { execSync } from 'node:child_process'
import { mkdtempSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { FileTestHelper } from 'cli-testlab'

const PROJECT_ROOT = resolve(__dirname, '..')
const FIXTURES_DIR = join(PROJECT_ROOT, 'test', 'fixtures')
const NODE_MODULES = join(PROJECT_ROOT, 'node_modules')

const PG_SCHEMA_V1 = `
import { serial, text, pgTable } from 'drizzle-orm/pg-core'

export const projects = pgTable('projects', {
  id: serial().primaryKey(),
  name: text().notNull(),
})
`

const PG_SCHEMA_V2 = `
import { serial, text, integer, pgTable } from 'drizzle-orm/pg-core'

export const projects = pgTable('projects', {
  id: serial().primaryKey(),
  name: text().notNull(),
})

export const users = pgTable('users', {
  id: serial().primaryKey(),
  name: text().notNull(),
  project_id: integer('project_id').references(() => projects.id),
})
`

const MYSQL_SCHEMA_V1 = `
import { int, varchar, mysqlTable } from 'drizzle-orm/mysql-core'

export const projects = mysqlTable('projects', {
  id: int().autoincrement().primaryKey(),
  name: varchar({ length: 255 }).notNull(),
})
`

const MYSQL_SCHEMA_V2 = `
import { int, varchar, mysqlTable } from 'drizzle-orm/mysql-core'

export const projects = mysqlTable('projects', {
  id: int().autoincrement().primaryKey(),
  name: varchar({ length: 255 }).notNull(),
})

export const users = mysqlTable('users', {
  id: int().autoincrement().primaryKey(),
  name: varchar({ length: 255 }).notNull(),
  project_id: int('project_id').references(() => projects.id),
})
`

/**
 * Use drizzle-kit to generate real new-format (folder-per-migration) migrations.
 * Generates two migrations: "init" (projects table) and "add_users" (adds users table).
 * Returns the path to the output directory containing the migration folders.
 *
 * Schema and config files are written to the project directory (where node_modules lives)
 * so drizzle-kit can resolve drizzle-orm imports. They are cleaned up after generation.
 */
export function generateNewFormatMigrations(dialect: 'postgresql' | 'mysql'): string {
  const id = `${dialect}_${Date.now()}`
  const outDir = mkdtempSync(join(tmpdir(), 'drizzle-migrations-'))
  const schemaPath = join(FIXTURES_DIR, `_gen_schema_${id}.ts`)
  const configFileName = `_gen_drizzle_${id}.config.ts`
  const configPath = join(PROJECT_ROOT, configFileName)

  const [v1, v2] =
    dialect === 'postgresql' ? [PG_SCHEMA_V1, PG_SCHEMA_V2] : [MYSQL_SCHEMA_V1, MYSQL_SCHEMA_V2]

  const outDirForConfig = outDir.replace(/\\/g, '/')
  writeFileSync(
    configPath,
    `export default { dialect: '${dialect}', schema: './test/fixtures/_gen_schema_${id}.ts', out: '${outDirForConfig}' }\n`,
  )

  try {
    writeFileSync(schemaPath, v1)
    execSync(`npx drizzle-kit generate --name=init --config=${configFileName}`, {
      cwd: PROJECT_ROOT,
      stdio: 'pipe',
      timeout: 30000,
      env: { ...process.env, NODE_PATH: NODE_MODULES },
    })

    writeFileSync(schemaPath, v2)
    execSync(`npx drizzle-kit generate --name=add_users --config=${configFileName}`, {
      cwd: PROJECT_ROOT,
      stdio: 'pipe',
      timeout: 30000,
      env: { ...process.env, NODE_PATH: NODE_MODULES },
    })
  } finally {
    try {
      unlinkSync(schemaPath)
    } catch {}
    try {
      unlinkSync(configPath)
    } catch {}
  }

  return outDir
}

export function cleanupGeneratedMigrations(outDir: string): void {
  const helper = new FileTestHelper()
  helper.deleteDir(outDir, { isPathAbsolute: true, maxRetries: 3, retryDelay: 100 })
}
