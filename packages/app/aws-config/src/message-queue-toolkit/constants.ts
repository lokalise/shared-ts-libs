export const MESSAGE_TYPE_FIELD = 'type'
export const DLQ_SUFFIX = '-dlq'
export const DLQ_MAX_RECEIVE_COUNT = 5
export const DLQ_MESSAGE_RETENTION_PERIOD = 7 * 24 * 60 * 60 // 7 days in seconds
export const VISIBILITY_TIMEOUT = 60 // 1 minutes
export const HEARTBEAT_INTERVAL = 20 // 20 seconds
export const MAX_RETRY_DURATION = 2 * 24 * 60 * 60 // 2 days in seconds

/** Maximum lengths for queue and topic names allowed, to ensure that AWS limits are not exceeded after applying prefixes. */
export const MAX_QUEUE_NAME_LENGTH = 64 // AWS limit is 80, but we need to leave space for the prefix and -dlq suffix
export const MAX_TOPIC_NAME_LENGTH = 246 // AWS limit is 256, but we need to leave space for the prefix
