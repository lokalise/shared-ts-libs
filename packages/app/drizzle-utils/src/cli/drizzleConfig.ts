import { pathToFileURL } from 'node:url'

export interface DrizzleDbCredentials {
  url?: string
  host?: string
  port?: number
  user?: string
  password?: string
  database?: string
}

export interface DrizzleConfig {
  dialect?: string
  out?: string
  dbCredentials?: DrizzleDbCredentials
}

export async function loadConfig(configPath: string): Promise<DrizzleConfig> {
  const mod = (await import(pathToFileURL(configPath).href)) as
    | { default?: DrizzleConfig }
    | DrizzleConfig
  return ('default' in mod && mod.default ? mod.default : mod) as DrizzleConfig
}

export function buildConnectionUrl(credentials: DrizzleDbCredentials, dialect: string): string {
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
