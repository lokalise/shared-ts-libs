import { PgBoss } from 'pg-boss'

/** Every run starts from an empty pg-boss schema, so jobs left over by an earlier run cannot leak in. */
export async function setup(): Promise<void> {
  process.loadEnvFile('./.env.test')
  const schema = process.env.PGBOSS_SCHEMA as string

  const boss = new PgBoss({ connectionString: process.env.DATABASE_URL, schema, supervise: false })
  await boss.start()
  await boss.getDb().executeSql(`DROP SCHEMA IF EXISTS ${schema} CASCADE`)
  await boss.stop({ graceful: false })
}
