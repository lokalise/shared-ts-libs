import type { FastifyAuthFunction } from '@fastify/auth'
import fastifyAuth from '@fastify/auth'
import fastifyBasicAuth from '@fastify/basic-auth'
import { AuthFailedError } from '@lokalise/node-core'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import fp from 'fastify-plugin'

export type AuthConfig = {
  isEnabled: boolean
  username: string
  password: string
}

type BasicAuthOptions = {
  config: AuthConfig
  /**
   * Paths that require basic auth. Each entry protects the path itself and every route under it,
   * e.g. `/bull` covers `/bull/`, `/bull/api/queues` and `/bull/static/*`, but not `/bullet`.
   * The root path `/` is matched exactly, so it does not protect the whole app.
   */
  enableList: Set<string>
}

function validate(config: AuthConfig) {
  return (
    username: string,
    password: string,
    _req: FastifyRequest,
    _reply: FastifyReply,
    done: (err?: Error) => void,
  ) => {
    if (username === config.username && password === config.password) {
      done()
    } else {
      done(new AuthFailedError())
    }
  }
}

function requiresAuth(url: string | undefined, enableList: Set<string>): boolean {
  if (!url) return false
  if (enableList.has(url)) return true

  for (const path of enableList) {
    if (path === '/') continue
    if (url.startsWith(path.endsWith('/') ? path : `${path}/`)) return true
  }
  return false
}

function enableListAuthHandler(enableList: Set<string>): FastifyAuthFunction {
  return (req, _res, done) => {
    // If the route is NOT in or under an enableList path, allow through: skip auth
    if (!requiresAuth(req.routeOptions.url, enableList)) {
      return done() // success: skip the rest of the handlers
    }
    // If the route IS in enableList, fail: go to next handler (basicAuth)
    // String for performance, it also works
    return done('Needs auth' as unknown as Error)
  }
}

async function plugin(fastify: FastifyInstance, pluginOptions: BasicAuthOptions): Promise<void> {
  if (!pluginOptions.config.isEnabled) {
    return
  }

  if (!fastify.auth) {
    await fastify.register(fastifyAuth)
  }
  await fastify.register(fastifyBasicAuth, {
    validate: validate(pluginOptions.config),
    authenticate: true,
  })

  fastify.after(() => {
    fastify.addHook(
      'onRequest',
      fastify.auth([enableListAuthHandler(pluginOptions.enableList), fastify.basicAuth]),
    )
  })
}

export const basicAuth = fp<BasicAuthOptions>(plugin, {
  fastify: '>=4.0.0',
  name: 'basic-auth',
})
