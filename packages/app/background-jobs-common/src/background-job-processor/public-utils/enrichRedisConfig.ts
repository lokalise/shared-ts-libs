import * as dns from 'node:dns'
import type { ClusterOptions, RedisOptions } from 'ioredis'

/**
 * Default reconnectOnError handler for Redis connections.
 * Handles Redis failover scenarios, particularly READONLY errors.
 *
 * @param err - The error from Redis connection
 * @returns true to trigger reconnection, false otherwise
 */
const defaultReconnectOnError = (err: Error): boolean => {
  // Essential during failover scenarios when Redis switches from master to replica
  if (err.message.includes('READONLY')) return true
  return false
}

const cloudDnsLookup = (address: string, callback: (err: Error | null, ip: string) => void) => {
  return dns.lookup(address, { family: 4, all: false }, callback)
}

/**
 * Enriches Redis configuration with default reconnectOnError hook if not already present.
 * This ensures proper handling of Redis failover scenarios.
 *
 * @param config - The Redis configuration to enrich
 * @returns Enriched Redis configuration with reconnectOnError hook
 */
export const enrichRedisConfig = (config: RedisOptions): RedisOptions => ({
  ...config,
  reconnectOnError: config.reconnectOnError ?? defaultReconnectOnError,
})

// ioredis declares `dnsLookup` on `ClusterOptions` only: a standalone `Redis` connection does not read it.
type RedisOptionsWithDnsLookup = RedisOptions & Pick<ClusterOptions, 'dnsLookup'>

/**
 * This is config optimized for managed redis instances, such as AWS ElastiCache or GCP Memorystore.
 * @param config
 */
export const enrichRedisConfigOptimizedForCloud = (
  config: RedisOptionsWithDnsLookup,
): RedisOptionsWithDnsLookup => ({
  ...config,
  reconnectOnError: config.reconnectOnError ?? defaultReconnectOnError,
  dnsLookup: config.dnsLookup ?? cloudDnsLookup,
})
