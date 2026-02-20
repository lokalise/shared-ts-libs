type ObjectValues<T> = T[keyof T]

export const DbDriverEnum = {
  COCKROACH_DB: 'CockroachDb',
  POSTGRES: 'Postgres',
} as const
export type DbDriver = ObjectValues<typeof DbDriverEnum>
