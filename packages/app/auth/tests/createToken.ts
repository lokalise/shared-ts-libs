import { SignJWT } from 'jose'
import type { TestContext } from './testContext.ts'

export const createToken = async (
  testContext: TestContext,
  payload: Record<string, unknown> = {},
  headerOverrides: Record<string, unknown> = {},
): Promise<string> => {
  const finalPayload = {
    exp: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
    ...payload, // payload can override the default exp
  }

  const jwt = new SignJWT(finalPayload).setProtectedHeader({
    alg: 'RS256',
    typ: 'JWT',
    kid: testContext.keys.kid,
    ...headerOverrides,
  })

  return await jwt.sign(testContext.keys.privateKey)
}
