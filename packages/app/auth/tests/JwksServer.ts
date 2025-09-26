import { exportJWK } from 'jose'
import { getLocal, type Mockttp } from 'mockttp'
import type { TestContext } from './testContext.ts'

export class JwksServer {
  private readonly server: Mockttp

  private readonly path = '/.well-known/jwks'
  constructor() {
    this.server = getLocal()
  }

  get jwksUrl() {
    return `${this.server.url}${this.path}`
  }

  async start(testContext: TestContext) {
    await this.server.start()

    await this.server.forGet(this.path).thenReply(
      200,
      JSON.stringify({
        keys: [
          {
            ...(await exportJWK(testContext.keys.publicKey)),
            kid: testContext.keys.kid,
            alg: 'RS256',
            use: 'sig',
          },
        ],
      }),
    )
  }

  async stop() {
    await this.server.stop()
  }
}
