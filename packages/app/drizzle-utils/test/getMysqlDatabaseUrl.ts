const MYSQL_DATABASE_URL_ENVVAR = 'MYSQL_DATABASE_URL'

export const getMysqlDatabaseUrl = (): string => {
  const databaseUrl = (process.env[MYSQL_DATABASE_URL_ENVVAR] ?? '').trim()

  if (!databaseUrl) {
    throw new Error(`Environment variable ${MYSQL_DATABASE_URL_ENVVAR} is not set`)
  }

  return databaseUrl
}
