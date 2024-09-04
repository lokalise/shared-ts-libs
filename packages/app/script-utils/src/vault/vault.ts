/* c8 ignore start */
import type { SpawnSyncReturns } from 'node:child_process'
import { execSync } from 'node:child_process'

import { globalLogger } from '@lokalise/node-core'

type VaultGetTokenResponse = {
  request_id: string
  data: {
    id: string
    expire_time: string
  }
}

type VaultGetVarsResponse = {
  request_id: string
  data: {
    data: Record<string, string>
    metadata: {
      version: number
    }
  }
}

const isExecError = (e: unknown): e is Error & SpawnSyncReturns<string | Buffer> =>
  typeof e === 'object' && e !== null && 'stderr' in e

const installVaultCli = () => {
  const osType = process.platform
  if (osType === 'linux') {
    try {
      execSync('which vault')
    } catch (_e) {
      // if it fails means vault is not found -> install
      execSync('sudo apt update && sudo apt install gpg')
      execSync(
        'wget -O- https://apt.releases.hashicorp.com/gpg | sudo gpg --dearmor -o /usr/share/keyrings/hashicorp-archive-keyring.gpg',
      )
      execSync(
        'echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/hashicorp-archive-keyring.gpg] https://apt.releases.hashicorp.com $(lsb_release -cs) main" | sudo tee /etc/apt/sources.list.d/hashicorp.list',
      )
      execSync('sudo apt update && sudo apt install vault')
    }
  } else if (osType === 'darwin') {
    // macOS
    execSync('brew list vault || brew install vault') // installing only if not installed
  } else {
    globalLogger.warn(
      `You are running ${osType}, which doesn't support autoinstall, please ensure that Vault is installed and is accessible globally via "vault" command.`,
    )
  }
}

// eslint-disable-next-line max-statements
export const vaultLogin = (vaultUrl: string) => {
  process.env.VAULT_ADDR = vaultUrl

  let tokenResponse: VaultGetTokenResponse | null = null

  const loginCommand = 'vault login -method=oidc -path=gsuite -no-print'
  const tokenCommand = 'vault token lookup -format=json'
  try {
    installVaultCli()
    try {
      // If the token doesn't exist or is expired --> login
      tokenResponse = JSON.parse(execSync(tokenCommand).toString()) as VaultGetTokenResponse

      if (tokenResponse && new Date(tokenResponse.data.expire_time) <= new Date()) {
        execSync(loginCommand)
        tokenResponse = null
      }
    } catch (_e) {
      execSync(loginCommand)
    }

    if (!tokenResponse) {
      tokenResponse = JSON.parse(execSync(tokenCommand).toString()) as VaultGetTokenResponse
    }
  } catch (e: unknown) {
    if (e instanceof Error) {
      globalLogger.info(`Vault login error -> ${e.message}`)
    }
  }

  process.env.VAULT_TOKEN = tokenResponse?.data.id ?? ''
}

export const vaultGetVars = (service: string): Record<string, string> => {
  if (!process.env.VAULT_TOKEN) {
    return {}
  }

  try {
    const responseJson = JSON.parse(
      execSync(`vault kv get -format=json "kv/${service}/dev"`).toString(),
    ) as VaultGetVarsResponse

    globalLogger.info(`Vault ${service} version: ${responseJson.data.metadata.version}`)

    return responseJson.data.data
  } catch (e: unknown) {
    if (isExecError(e)) {
      globalLogger.error(`Vault ${service} error downloading env vars -> ${e.stderr.toString()}`)
    }
    return {}
  }
}
/* c8 ignore end */
