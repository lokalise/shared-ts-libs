/**
 * The field name used to identify message types in the message queue system.
 * This field is used for message routing and handler selection.
 */
export const MESSAGE_TYPE_FIELD = 'type'

/**
 * Suffix appended to queue names to create Dead Letter Queues (DLQ).
 * DLQs are used to store messages that cannot be processed successfully after multiple retries.
 */
export const DLQ_SUFFIX = '-dlq'

/**
 * Maximum number of times a message can be received before being moved to the Dead Letter Queue.
 * This prevents infinite retry loops for problematic messages.
 */
export const DLQ_MAX_RECEIVE_COUNT = 5

/**
 * Message retention period for Dead Letter Queue messages in seconds.
 * Messages in the DLQ will be automatically deleted after this period.
 *
 * @value 7 days in seconds
 */
export const DLQ_MESSAGE_RETENTION_PERIOD = 7 * 24 * 60 * 60

/**
 * Visibility timeout for SQS messages in seconds.
 * When a message is received by a consumer, it becomes invisible to other consumers
 * for this duration. If not deleted within this time, it becomes visible again.
 *
 * @value 60 seconds
 */
export const VISIBILITY_TIMEOUT = 60

/**
 * Heartbeat interval for long-running message processing in seconds.
 * Used to extend the visibility timeout for messages that take longer to process.
 *
 * @value 20 seconds
 */
export const HEARTBEAT_INTERVAL = 20

/**
 * Maximum duration for retrying failed messages in seconds.
 * After this period, messages will be moved to the Dead Letter Queue.
 *
 * @value 2 days in seconds
 */
export const MAX_RETRY_DURATION = 2 * 24 * 60 * 60

/**
 * Maximum length for queue names to ensure AWS limits are not exceeded.
 * AWS SQS queue name limit is 80 characters, but we reserve space for prefixes and DLQ suffix.
 *
 * @value 64 - AWS limit is 80, but we need to leave space for the prefix and -dlq suffix
 */
export const MAX_QUEUE_NAME_LENGTH = 64

/**
 * Maximum length for topic names to ensure AWS limits are not exceeded.
 * AWS SNS topic name limit is 256 characters, but we reserve space for prefixes.
 *
 * @value 246 - AWS limit is 256, but we need to leave space for the prefix
 */
export const MAX_TOPIC_NAME_LENGTH = 246
