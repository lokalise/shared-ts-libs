export type RecordKeyType = string | number | symbol

export type KeysMatching<T extends object, V> = {
  [K in keyof T]: T[K] extends V ? K : never
}[keyof T]
