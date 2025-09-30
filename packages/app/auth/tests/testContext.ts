import { exportSPKI, type GenerateKeyPairResult, generateKeyPair } from 'jose'

export type TestContext = {
  keys: GenerateKeyPairResult & { kid?: string }
  publicKeyPem: string
}

export const createTestContext = async (kid?: string): Promise<TestContext> => {
  const keys = await generateKeyPair('RS256')
  return { keys: { ...keys, kid }, publicKeyPem: await exportSPKI(keys.publicKey) }
}
