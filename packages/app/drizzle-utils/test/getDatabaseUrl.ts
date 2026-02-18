const DATABASE_URL_ENVVAR = 'DATABASE_URL'

export const getDatabaseUrl = (): string => {
  const databaseUrl = process.env[DATABASE_URL_ENVVAR]

  if (!databaseUrl) {
    throw new Error(`Environment variable ${DATABASE_URL_ENVVAR} is not set`)
  }

  return databaseUrl
}
