export const isObject = (maybeObject: unknown): maybeObject is Record<PropertyKey, unknown> =>
  typeof maybeObject === 'object' && maybeObject !== null
