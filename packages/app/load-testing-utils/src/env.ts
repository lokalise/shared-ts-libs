import { readFileSync } from 'node:fs'

/**
 * Reads a hand-written env file: `KEY=value` lines, `#` comments, and values
 * optionally wrapped in double quotes. No interpolation, no `export` keyword
 * and no multi-line values, which is what keeps this from needing dotenv.
 */
export function parseEnvFile(contents: string): Record<string, string> {
  const values: Record<string, string> = {}
  for (const line of contents.split('\n')) {
    const trimmed = line.trim()
    if (trimmed === '' || trimmed.startsWith('#')) continue

    const separator = trimmed.indexOf('=')
    if (separator === -1) continue

    const key = trimmed.slice(0, separator).trim()
    const raw = trimmed.slice(separator + 1).trim()
    values[key] =
      raw.length >= 2 && raw.startsWith('"') && raw.endsWith('"') ? raw.slice(1, -1) : raw
  }
  return values
}

export const readEnvFile = (path: string): Record<string, string> =>
  parseEnvFile(readFileSync(path, 'utf8'))

/**
 * Moves every port the env file names to wherever `env` says it now lives:
 * `localhost:5451` inside a DSN, and a bare `5451` in a `*_PORT` variable.
 *
 * `portVariables` maps each default port to the variable that overrides it, the
 * same variables the compose file and the fakes read, so a moved container and
 * the service that dials it move together.
 */
export function retargetPorts(
  values: Record<string, string>,
  portVariables: Record<string, string>,
  env: NodeJS.ProcessEnv = process.env,
): Record<string, string> {
  const portFor = (port: string) => {
    const variable = portVariables[port]
    return (variable && env[variable]) || port
  }

  return Object.fromEntries(
    Object.entries(values).map(([key, value]) => {
      if (key.endsWith('_PORT') && /^\d+$/.test(value)) return [key, portFor(value)]
      return [key, value.replace(/localhost:(\d+)/g, (_, port) => `localhost:${portFor(port)}`)]
    }),
  )
}

/**
 * `values` without the keys `env` already has, which is what `node --env-file`
 * does: a port or a DSN exported in the shell has to keep winning over the file.
 */
export function omitExported(
  values: Record<string, string>,
  env: NodeJS.ProcessEnv = process.env,
): Record<string, string> {
  return Object.fromEntries(Object.entries(values).filter(([key]) => env[key] === undefined))
}
