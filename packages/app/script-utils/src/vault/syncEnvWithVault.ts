import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { parseEnv } from 'node:util'
import { globalLogger } from '@lokalise/node-core'
import { vaultGetVars, vaultLogin } from './vault.ts'

/**
 * This function updates the contents of an .env file so the passed `key` has
 * a new `value` while preserving the rest of the contents. If the key is not
 * present, it will be appended to the end of the .env text.
 *
 * @param key The env variable to be updated
 * @param value The new value for the env variable
 * @param envContents String contents of the .env file
 * @param parsedEnv Record of .env file key-values (parsed using `dotenv.parse`)
 */
const upsertEnvValue = (
  key: string,
  value: string,
  envContents: string,
  parsedEnv: Record<string, string>,
) => {
  /* c8 ignore next */
  const formattedValue = value.includes('\n') ? `"${value.trim()}"` : value

  // Append to the end
  if (!Object.keys(parsedEnv).includes(key)) {
    const existingContent = envContents.trim().length > 0 ? `${envContents.trimEnd()}\n` : ''
    return `${existingContent}${key}=${formattedValue}\n`
  }

  // If variable is empty - set it
  if (parsedEnv[key] === '') {
    return envContents.replace(`${key}=`, `${key}=${formattedValue}`)
  }

  // Else replace the value itself with adding quotes
  // biome-ignore lint/style/noNonNullAssertion: Checked before
  return envContents.replace(parsedEnv[key]!, value.trim())
}

/**
 * Updates the .env file with new variables.
 *
 * @param envVars Record of variable key-values
 * @param file Path to the .env file
 */
export const updateEnvFile = (envVars: Record<string, string>, file: string) => {
  if (Object.entries(envVars).length === 0) {
    globalLogger.info(`Skipping env file ${file}`)
    return
  }
  let env = existsSync(file) ? readFileSync(file, { encoding: 'utf-8' }) : ''
  const parsedEnv = parseEnv(env) as Record<string, string>

  for (const [key, value] of Object.entries(envVars)) {
    env = upsertEnvValue(key, value, env, parsedEnv)
  }

  globalLogger.info(`Writing ${file}`)
  writeFileSync(file, env, { encoding: 'utf-8' })
}

/* c8 ignore start */
export const synchronizeEnvFileWithVault = ({
  dryRun,
  vault,
  vaultNamespace,
  vaultUrl,
  dotenvFilePath,
}: {
  dryRun: boolean
  vault: boolean
  vaultNamespace: string
  vaultUrl: string
  dotenvFilePath: string
}) => {
  if (vault) {
    vaultLogin(vaultUrl)
  }
  const envVarsLocal = vaultGetVars(vaultNamespace)

  if (dryRun) {
    globalLogger.info(envVarsLocal)
    globalLogger.info(`// ${dotenvFilePath}`)
  } else {
    updateEnvFile(envVarsLocal, dotenvFilePath)
  }
}
/* c8 ignore end */
