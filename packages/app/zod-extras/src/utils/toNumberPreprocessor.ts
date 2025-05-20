/**
 * Will try to convert any value to number,
 * using the rules found here https://ajv.js.org/coercion.html
 */
const toNumberPreprocessor = (value: unknown) => {
  if (typeof value === 'string' && value !== '' && !isNaN(+value)) {
    return +value
  }

  if (value === null) {
    return 0
  }

  switch (typeof value) {
    case 'boolean':
      return +value

    case 'bigint': // not defined in ajv spec, does NOT convert in order to not loose information
    case 'number':
      return value

    default:
      return value // could not coerce, return the original and face the consequences during validation
  }
}

export default toNumberPreprocessor
