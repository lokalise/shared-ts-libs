import type promClient from 'prom-client'
import type { Metric } from 'prom-client'

export const getOrCreateMetric = <T extends Metric>(
  client: typeof promClient,
  name: string,
  factory: () => T,
): T => {
  const existing = client.register.getSingleMetric(name)
  return existing ? (existing as T) : factory()
}
