/**
 * Will try to convert any value to boolean,
 * using the rules found here https://ajv.js.org/coercion.html
 */
const toBooleanPreprocessor = (value: unknown): boolean | unknown => {
  if (typeof value === 'string') {
    const lowered = value.toLowerCase()

    if (lowered === 'true') {
      return true
    }

    if (lowered === 'false') {
      return false
    }
  }

  if (typeof value === 'number') {
    if (value === 0 || value === 1) {
      return Boolean(value)
    }
  }

  if (value === null) {
    return false
  }

  return value // could not coerce, return the original and face the consequences during validation
}

export default toBooleanPreprocessor
