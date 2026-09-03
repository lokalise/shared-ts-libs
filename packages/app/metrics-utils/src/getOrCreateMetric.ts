import type promClient from '@prometheus-io/client'
import type { Metric } from '@prometheus-io/client'

export const getOrCreateMetric = <T extends Metric>(
  client: typeof promClient,
  name: string,
  factory: () => T,
): T => {
  const existing = client.register.getSingleMetric(name)
  return existing ? (existing as T) : factory()
}
