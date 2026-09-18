/**
 * A label name has to be a Prometheus name at the other end, whatever the SDK
 * accepts on the way out: Pyroscope rejects the whole series when one is not
 * `[a-zA-Z_][a-zA-Z0-9_]*`, and the exporter reports a rejected ingest through
 * `debug` and swallows it. A `service.name` tag or a `tenant-id` label would
 * otherwise leave a service logging a clean start with no profile ever landing.
 */
const INVALID_LABEL_NAME_CHARACTERS = /[^a-zA-Z0-9_]/g

export const toLabelName = (name: string): string => {
  const sanitized = name.replace(INVALID_LABEL_NAME_CHARACTERS, '_')
  return /^\d/.test(sanitized) ? `_${sanitized}` : sanitized
}
