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
} & (
  | {
      /**
       * Paths that require basic auth. Each entry protects the path itself and every route under it,
       * e.g. `/bull` (or `/bull/`) covers `/bull`, `/bull/api/queues` and `/bull/static/*`, but not `/bullet`.
       * Entries are full route paths, so include any prefix the protected routes are registered under.
       * The root path `/` is matched exactly, so it does not protect the whole app. Empty entries are ignored.
       */
      enableList: Set<string>
      skipList?: never
    }
  | {
      /**
       * Route paths that do not require basic auth; every other route does, including unmatched ones.
       * Entries are matched exactly against the registered route path, e.g. `/health` skips `/health` only,
       * and `/users/:id` skips that parametric route.
       */
      skipList: Set<string>
      enableList?: never
    }
)

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

type ProtectedPaths = {
  exact: Set<string>
  prefixes: string[]
}

function toProtectedPaths(enableList: Set<string>): ProtectedPaths {
  const exact = new Set<string>()
  const prefixes: string[] = []

  for (const entry of enableList) {
    if (entry === '') continue

    const path = entry.replace(/\/+$/, '')
    // The root is matched exactly: as a prefix it would put auth on every route, health checks included
    if (path === '') {
      exact.add('/')
      continue
    }

    exact.add(path)
    prefixes.push(`${path}/`)
  }

  return { exact, prefixes }
}

function requiresAuth(url: string | undefined, protectedPaths: ProtectedPaths): boolean {
  if (!url) return false
  if (protectedPaths.exact.has(url)) return true
  return protectedPaths.prefixes.some((prefix) => url.startsWith(prefix))
}

function enableListAuthHandler(enableList: Set<string>): FastifyAuthFunction {
  const protectedPaths = toProtectedPaths(enableList)

  return (req, _res, done) => {
    if (!requiresAuth(req.routeOptions.url, protectedPaths)) {
      return done() // success: skip the rest of the handlers
    }
    // Matching by prefix, not exact route, is what keeps BullBoard's API routes under /bull/ protected.
    // Fail here to go to the next handler (basicAuth). String for performance, it also works
    return done('Needs auth' as unknown as Error)
  }
}

function skipListAuthHandler(skipList: Set<string>): FastifyAuthFunction {
  return (req, _res, done) => {
    if (req.routeOptions.url && skipList.has(req.routeOptions.url)) {
      return done() // success: skip the rest of the handlers
    }
    // Fail here to go to the next handler (basicAuth). String for performance, it also works
    return done('Needs auth' as unknown as Error)
  }
}

function resolveAccessHandler(pluginOptions: BasicAuthOptions): FastifyAuthFunction {
  const { enableList, skipList } = pluginOptions
  if (enableList && skipList) {
    throw new Error('basic-auth: enableList and skipList are mutually exclusive, pass only one')
  }
  if (skipList) return skipListAuthHandler(skipList)
  if (enableList) return enableListAuthHandler(enableList)
  throw new Error('basic-auth: either enableList or skipList is required')
}

async function plugin(fastify: FastifyInstance, pluginOptions: BasicAuthOptions): Promise<void> {
  if (!pluginOptions.config.isEnabled) {
    return
  }

  const accessHandler = resolveAccessHandler(pluginOptions)

  if (!fastify.auth) {
    await fastify.register(fastifyAuth)
  }
  await fastify.register(fastifyBasicAuth, {
    validate: validate(pluginOptions.config),
    authenticate: true,
  })

  fastify.after(() => {
    fastify.addHook('onRequest', fastify.auth([accessHandler, fastify.basicAuth]))
  })
}

export const basicAuth = fp<BasicAuthOptions>(plugin, {
  fastify: '>=4.0.0',
  name: 'basic-auth',
})
