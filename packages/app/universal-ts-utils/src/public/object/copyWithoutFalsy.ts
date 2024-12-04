import type { RecordKeyType } from '../../internal/types.js'

type Output<T extends Record<RecordKeyType, unknown>> = Pick<
  T,
  {
    [Prop in keyof T]: T[Prop] extends null | undefined | '' ? never : Prop
  }[keyof T]
>

export const copyWithoutFalsy = <T extends Record<RecordKeyType, unknown>>(object: T): Output<T> =>
  Object.keys(object).reduce(
    (acc, key) => {
      const value = object[key] as unknown
      if (!value) return acc
      if (typeof value === 'string' && value.trim().length === 0) return acc

      // TODO: handle nested objects
      acc[key] = object[key]
      return acc
    },
    {} as Record<RecordKeyType, unknown>,
  ) as Output<T>
