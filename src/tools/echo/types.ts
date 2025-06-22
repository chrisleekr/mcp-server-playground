import { z } from 'zod';

/**
 * Echo Tool Input Schema
 */
export const EchoInputSchema = z
  .object({
    message: z.string().min(1).max(1000).describe('The message to echo back'),
    repeat: z
      .number()
      .int()
      .min(1)
      .max(10)
      .default(1)
      .describe('Number of times to repeat the message (1-10)'),
    uppercase: z
      .boolean()
      .default(false)
      .describe('Whether to convert the message to uppercase'),
  })
  .required({ message: true });

export type EchoInput = z.infer<typeof EchoInputSchema>;

/**
 * Echo Tool Output Interface
 */
export interface EchoOutput {
  originalMessage: string;
  processedMessage: string;
  repeat: number;
  uppercase: boolean;
  length: number;
}
