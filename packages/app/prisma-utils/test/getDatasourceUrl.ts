const EnvDatabaseUrlKey = 'DATABASE_URL'

export const getDatasourceUrl = (): string => {
  const databaseUrl = process.env[EnvDatabaseUrlKey]
  if (!databaseUrl) throw new Error(`Environment variable ${EnvDatabaseUrlKey} is not set`)

  return databaseUrl
}
