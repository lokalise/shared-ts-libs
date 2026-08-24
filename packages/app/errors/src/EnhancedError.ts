// Namespaces the global Symbol.for registry keys so they can only collide with
// other copies of this package, not with unrelated code using the same pattern.
const PROTOTYPE_PATH_NAMESPACE = '@lokalise/errors'

const PROTOTYPE_PATH_DELIMITER = '.'

const getSymbolKey = (prototypePath: string): string =>
  `${PROTOTYPE_PATH_NAMESPACE}${PROTOTYPE_PATH_DELIMITER}${prototypePath}`

const getPrototypeNamesPostError = (input: unknown): string[] => {
  const names: string[] = []

  const isFunction = typeof input === 'function'

  // biome-ignore lint/complexity/noBannedTypes: describes prototype
  let current: Function = isFunction ? input : Object.getPrototypeOf(input)

  while (current !== null) {
    const name = isFunction ? current.name : current.constructor.name

    if (!name) {
      break
    }

    names.push(name)
    current = Object.getPrototypeOf(current)
  }

  const reversedNames = names.reverse()

  const errorIndex = reversedNames.indexOf(Error.name)

  return reversedNames.slice(errorIndex + 1)
}

const generatePrototypePaths = (arr: string[]): string[] => {
  return arr.reduce<string[]>((acc, element) => {
    const prev = acc.at(-1)

    if (!prev) {
      acc.push(element)
    } else {
      acc.push(`${prev}${PROTOTYPE_PATH_DELIMITER}${element}`)
    }

    return acc
  }, [])
}

/**
 * Options accepted by every error constructor.
 *
 * `details` is required when `TDetails` is a concrete type, and optional
 * (or absent) when `TDetails` is `undefined`.
 */
export type EnhancedErrorOptions<TDetails> = {
  message: string
  cause?: unknown
} & (undefined extends TDetails ? { details?: TDetails } : { details: TDetails })

/**
 * Shared abstract base for all application errors.
 *
 * Do NOT extend this directly — use {@link InternalError} for non-public
 * operational errors or {@link PublicError} for errors surfaced to clients.
 *
 * Enables reliable instanceof checks across realms (e.g., iframes, workers,
 * Node.js VM) and across duplicated copies of this package in `node_modules`.
 * Also ensures subclasses like `NotFoundError` have a consistent error name
 * (i.e., `error.name` is set to the subclass name instead of `EnhancedError`).
 *
 * It works by creating unique symbols for each inheritance path, such as:
 * - '@lokalise/errors.EnhancedError'
 * - '@lokalise/errors.EnhancedError.Subclass1'
 * - '@lokalise/errors.EnhancedError.Subclass1.Subclass2',
 * assigning them to the instance using `Symbol.for` on instantiation.
 * The custom `instanceof` logic (overriding `Symbol.hasInstance`) checks if the
 * corresponding symbol for the constructor's prototype path exists on the
 * tested object.
 *
 * This technique allows `instanceof` to succeed across realms where normal
 * prototype chain checks fail, because symbols created via `Symbol.for` are
 * shared globally and can be reliably compared.
 */
export abstract class EnhancedError<TDetails = undefined> extends Error {
  /**
   * Stable, unique string identifier for this error class.
   * Must be declared `readonly` in every subclass to enable TS narrowing.
   */
  abstract readonly code: string

  readonly details: TDetails

  constructor(options: EnhancedErrorOptions<TDetails>) {
    super(options.message, { cause: options.cause })

    // Set the error's name to the name of the class that was instantiated
    this.name = new.target.name
    // Cast needed because the conditional type is not narrowed by the compiler here.
    this.details = options.details as TDetails

    const prototypeNames = getPrototypeNamesPostError(this)
    const prototypePaths = generatePrototypePaths(prototypeNames)

    for (const prototypePath of prototypePaths) {
      const symbol = Symbol.for(getSymbolKey(prototypePath))

      Object.defineProperty(this, symbol, { value: true })
    }
  }

  static override [Symbol.hasInstance](val: unknown): boolean {
    if (val === null || typeof val !== 'object') {
      return false
    }

    // biome-ignore lint/complexity/noThisInStatic: intentional to support subclasses
    const prototypeNames = getPrototypeNamesPostError(this)
    const symbol = Symbol.for(getSymbolKey(prototypeNames.join(PROTOTYPE_PATH_DELIMITER)))

    return symbol in val && val[symbol] === true
  }
}
