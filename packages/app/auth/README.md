# @lokalise/auth

A flexible, type-safe authentication library for Fastify applications built with TypeScript. This library provides a 
clean abstraction for JWT-based authentication with support for multiple authentication strategies and
token verification methods.

## Features

- 🔐 **JWT-based Authentication** - Built-in support for JWT token verification
- 🔗 **Multiple Token Decoders** - Support for JWKS and static key verification
- ⛓️ **Authenticator Chains** - Chain multiple authenticators for complex authentication flows
- 🚀 **Fastify Integration** - Seamless integration with Fastify request lifecycle
- 🛡️ **Type Safety** - Full TypeScript support with generic types

## Quick Start

### Basic JWT Authentication

```typescript
import { FastifyInstance } from 'fastify'
import { 
  JwtBasedAuthenticator, 
  KeyBasedTokenDecoder, 
  createAuthenticationPreHandler,
  type BaseAuthInfo 
} from '@lokalise/auth'

// Define your authentication info type
type MyAuthInfo = BaseAuthInfo<'my-provider'> & {
  userId: string
  email: string
}

// Create a custom authenticator
class MyAuthenticator extends JwtBasedAuthenticator<MyAuthInfo> {
  protected internalAuthenticate(reqContext, jwtPayload, rawToken) {
    // Validate the JWT payload and extract user information
    if (!jwtPayload.sub || !jwtPayload.email) {
      return { success: false, failure: 'INVALID_CREDENTIALS' }
    }

    return {
      success: true,
      authInfo: {
        authType: 'my-provider',
        rawToken,
        userId: jwtPayload.sub,
        email: jwtPayload.email
      }
    }
  }
}

// Set up authentication
const tokenDecoder = new KeyBasedTokenDecoder('your-secret-key')
const authenticator = new MyAuthenticator(tokenDecoder)
const authPreHandler = createAuthenticationPreHandler(authenticator)

// Register with Fastify
const fastify: FastifyInstance = // ... your fastify instance
fastify.addHook('preHandler', authPreHandler)

// Now your routes have access to authentication info
fastify.get('/protected', async (request, reply) => {
  const authInfo = request.reqContext.auth // MyAuthInfo | undefined
  return { message: `Hello ${authInfo?.email}!` }
})
```

### JWKS Authentication (OAuth/OpenID Connect)

```typescript
import { JwksTokenDecoder } from '@lokalise/auth'
import { createJwksClient } from 'jwks-rsa'

// Set up JWKS client for OAuth provider
const jwksClient = createJwksClient({
  jwksUri: 'https://your-oauth-provider.com/.well-known/jwks',
  cache: true,
  cacheMaxAge: 600000, // 10 minutes
})

const tokenDecoder = new JwksTokenDecoder(jwksClient, {
  algorithms: ['RS256'],
  issuer: 'https://your-oauth-provider.com'
})

const authenticator = new MyAuthenticator(tokenDecoder)
const authPreHandler = createAuthenticationPreHandler(authenticator)
```

### Multiple Authentication Strategies

```typescript
import { AuthenticatorChain } from '@lokalise/auth'

// Create multiple authenticators
const jwtAuthenticator = new MyJwtAuthenticator(jwtDecoder)
const apiKeyAuthenticator = new MyApiKeyAuthenticator()

// Chain them together
const chain = new AuthenticatorChain([
  jwtAuthenticator,
  apiKeyAuthenticator
])

const authPreHandler = createAuthenticationPreHandler(chain)
```

## API Reference

### Core Types

#### `BaseAuthInfo<AuthType>`

Base interface for authentication information:

```typescript
type BaseAuthInfo<AuthType extends string> = {
  authType: AuthType
  rawToken: string
}
```

#### `AuthResult<AuthInfo>`

Result of authentication attempt:

```typescript
type AuthResult<AuthInfo> = 
  | { success: true; authInfo: AuthInfo }
  | { success: false; failure: 'INVALID_CREDENTIALS' | 'EXPIRED_CREDENTIALS' }
```

### Authenticators

#### `Authenticator<AuthInfo>`

Base interface for all authenticators:

```typescript
interface Authenticator<AuthInfo extends BaseAuthInfo<string>> {
  authenticate(request: FastifyRequest): Promise<AuthResult<AuthInfo>>
}
```

#### `JwtBasedAuthenticator<AuthInfo>`

Abstract base class for JWT-based authentication:

```typescript
abstract class JwtBasedAuthenticator<AuthInfo extends BaseAuthInfo<string>> {
  constructor(tokenDecoder: TokenDecoder, tokenHeader?: string)
  
  // Must be implemented by subclasses
  protected abstract internalAuthenticate(
    reqContext: RequestContext,
    jwtPayload: object,
    rawToken: string
  ): AuthResult<AuthInfo> | Promise<AuthResult<AuthInfo>>
}
```

#### `AuthenticatorChain<AuthInfo>`

Chains multiple authenticators, trying each until one succeeds:

```typescript
class AuthenticatorChain<AuthInfo extends BaseAuthInfo<string>> {
  constructor(authentators: Authenticator<AuthInfo>[])
}
```

### Token Decoders

#### `TokenDecoder`

Base class for token verification:

```typescript
class TokenDecoder {
  constructor(decode: (token: string) => Promise<unknown> | unknown)
  decode(requestContext: RequestContext, token: string): Promise<Either<TokenValidationError, object>>
}
```

#### `KeyBasedTokenDecoder`

Uses a static key for JWT verification:

```typescript
class KeyBasedTokenDecoder extends TokenDecoder {
  constructor(key: string, options?: Partial<VerifierOptions>)
}
```

#### `JwksTokenDecoder`

Uses JWKS endpoint for JWT verification:

```typescript
class JwksTokenDecoder extends TokenDecoder {
  constructor(jwksClient: JwksClient, options?: Partial<VerifierOptions>)
}
```

### Fastify Integration

#### `createAuthenticationPreHandler<AuthInfo>`

Creates a Fastify pre-handler for authentication:

```typescript
function createAuthenticationPreHandler<AuthInfo extends BaseAuthInfo<string>>(
  authenticator: Authenticator<AuthInfo>
): (request: FastifyRequest) => Promise<void>
```

## Error Handling

The library provides consistent error handling with proper HTTP status codes:

- **401 Unauthorized** - For invalid or expired credentials
- **Proper Error Codes** - `INVALID_CREDENTIALS` or `EXPIRED_CREDENTIALS`

```typescript
// Errors are thrown as PublicNonRecoverableError
try {
  await authPreHandler(request)
} catch (error) {
  if (error instanceof PublicNonRecoverableError) {
    console.log(error.httpStatusCode) // 401
    console.log(error.errorCode) // 'INVALID_CREDENTIALS' or 'EXPIRED_CREDENTIALS'
  }
}
```

## Request Context Extension

The library extends Fastify-extras `RequestContext` with authentication information:

```typescript
declare module '@lokalise/fastify-extras' {
  interface RequestContext {
    auth?: BaseAuthInfo<string>
  }
}
```

## Custom Headers

You can specify custom headers for token extraction:

```typescript
const authenticator = new MyAuthenticator(tokenDecoder, 'x-custom-auth')
// Will look for tokens in the 'x-custom-auth' header instead of 'authorization'
```