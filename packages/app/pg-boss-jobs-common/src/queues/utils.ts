export const deadLetterQueueNameBuilder = (queueId: string): string => `${queueId}-dlq`
