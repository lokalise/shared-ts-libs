/**
 * Builds the grouping array for the Bull dashboard common to the specified service and module.
 *
 * @param serviceId - The identifier of the service.
 * @param moduleId - The identifier of the module.
 * @returns An array containing [serviceId, moduleId].
 *
 * @example
 * ```ts
 * import { commonBullDashboardGroupingBuilder } from './commonBullDashboardGroupingBuilder.ts';
 *
 * const grouping = commonBullDashboardGroupingBuilder('user-service', 'email-module');
 * console.log(grouping);
 * // Output: ['user-service', 'email-module']
 * ```
 */
export const commonBullDashboardGroupingBuilder = (
  serviceId: string,
  moduleId: string,
): string[] => [serviceId, moduleId]
