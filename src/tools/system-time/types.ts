import { z } from 'zod';

/**
 * System time tool input schema
 */
export const SystemTimeInputSchema = z
  .object({
    format: z
      .enum(['iso', 'unix', 'human', 'custom'])
      .default('iso')
      .describe('The format of the timestamp'),
    timezone: z.string().optional().describe('The timezone to use'),
    customFormat: z.string().optional().describe('A custom format string'),
    includeTimezone: z
      .boolean()
      .default(true)
      .describe('Whether to include the timezone in the output'),
  })
  .required({});

/**
 * System time tool input interface
 */
export type SystemTimeInput = z.infer<typeof SystemTimeInputSchema>;

/**
 * System time tool output interface
 */
export interface SystemTimeOutput {
  timestamp: string | number;
  timezone: string;
  format: string;
  utc: string;
  unix: number;
  human: string;
}
