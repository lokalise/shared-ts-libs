type IsolationLevel =
  | 'Serializable'
  | 'ReadCommitted'
  | 'ReadUncommitted'
  | 'RepeatableRead'
  | 'Snapshot'

export type CockroachDbIsolationLevel = Extract<IsolationLevel, 'ReadCommitted' | 'Serializable'>
