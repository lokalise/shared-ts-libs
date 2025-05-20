const toArrayPreprocessor = (value: unknown) => {
  if (Array.isArray(value)) {
    return value
  }

  switch (typeof value) {
    case 'string':
    case 'number':
    case 'bigint':
    case 'boolean':
      return [value]

    default:
      return value // could not coerce, return the original and face the consequences during validation
  }
}

export default toArrayPreprocessor
