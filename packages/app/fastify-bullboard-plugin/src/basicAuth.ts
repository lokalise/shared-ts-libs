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

function enableListAuthHandler(enableList: Set<string>): FastifyAuthFunction {
  return (req, _res, done) => {
    if (req.routeOptions.url && !enableList.has(req.routeOptions.url)) {
      return done()
    }

    return done(new AuthFailedError())
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
