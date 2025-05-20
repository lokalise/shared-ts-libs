type StringSplitFactoryOpts = Partial<{
  delimiter: string | RegExp
  trim: boolean
}>

const stringSplitFactory = (opts: StringSplitFactoryOpts = {}) => {
  const { delimiter = ',', trim = false } = opts

  return (input: unknown): unknown => {
    if (typeof input !== 'string') {
      return input // could not coerce, return the original and face the consequences during validation
    }

    const values = input.split(delimiter)

    if (trim) {
      return values.map((val) => val.trim())
    }

    return values
  }
}

export default stringSplitFactory
