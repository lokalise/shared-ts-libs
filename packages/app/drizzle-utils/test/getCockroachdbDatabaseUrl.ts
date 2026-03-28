const COCKROACHDB_DATABASE_URL_ENVVAR = 'COCKROACHDB_DATABASE_URL'

export const getCockroachdbDatabaseUrl = (): string => {
  const databaseUrl = process.env[COCKROACHDB_DATABASE_URL_ENVVAR]

  if (!databaseUrl) {
    throw new Error(`Environment variable ${COCKROACHDB_DATABASE_URL_ENVVAR} is not set`)
  }

  return databaseUrl
}
