import * as dns from 'node:dns'
import type { RedisConfig } from '@lokalise/node-core'

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
export const enrichRedisConfig = (config: RedisConfig): RedisConfig => ({
  ...config,
  reconnectOnError: config.reconnectOnError ?? defaultReconnectOnError,
})

/**
 * This is config optimized for managed redis instances, such as AWS ElastiCache or GCP Memorystore.
 * @param config
 */
export const enrichRedisConfigOptimizedForCloud = (config: RedisConfig): RedisConfig => ({
  ...config,
  reconnectOnError: config.reconnectOnError ?? defaultReconnectOnError,
  dnsLookup: config.dnsLookup ?? cloudDnsLookup,
})
