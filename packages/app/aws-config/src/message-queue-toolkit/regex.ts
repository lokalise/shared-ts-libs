/**
 * Regex to validate that topics names are following Lokalise convention.
 * pattern: <system_name>-<(flow|model)_name>
 *
 * Regex explanation:
 *  System name: [a-z]+(_[a-z]+)* -> One or more lowercase letters, optionally separated by underscores
 *  - -> Hyphen
 *  Flow or model name: [a-z]+(_[a-z]+)* -> One or more lowercase letters, optionally separated by underscores
 */
export const TOPIC_NAME_REGEX = /^[a-z]+(_[a-z]+)*-[a-z]+(_[a-z]+)*$/

/**
 * Regex to validate that queue names are following Lokalise convention.
 * pattern: <system_name>-<(flow|model)_name>-<(service|module)_name>
 *
 * Regex explanation:
 * System name: [a-z]+(_[a-z]+)* -> One or more lowercase letters, optionally separated by underscores
 * - -> Hyphen
 * Flow or model name: [a-z]+(_[a-z]+)* -> One or more lowercase letters, optionally separated by underscores
 * - -> Hyphen
 * service or module name: [a-z]+(_[a-z]+)* -> One or more lowercase letters, optionally separated by underscores
 */
export const QUEUE_NAME_REGEX = /^[a-z]+(_[a-z]+)*-[a-z]+(_[a-z]+)*-[a-z]+(_[a-z]+)*$/
