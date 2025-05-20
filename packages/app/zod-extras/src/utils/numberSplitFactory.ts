type NumberSplitFactoryOpts = Partial<{
  delimiter: string | RegExp
}>

const numberSplitFactory = (opts: NumberSplitFactoryOpts = {}) => {
  const { delimiter = ',' } = opts

  return (input: unknown): unknown => {
    if (typeof input !== 'string') {
      return input // could not coerce, return the original and face the consequences during validation
    }

    return input.split(delimiter).map(Number)
  }
}

export default numberSplitFactory
