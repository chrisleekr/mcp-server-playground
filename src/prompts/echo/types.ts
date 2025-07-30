import { z } from 'zod';

export const EchoPromptInputSchema = z.object({
  message: z.string().describe('The message to echo back').optional(),
  repeat: z
    .string()
    .describe('Number of times to repeat the message (1-10)')
    .optional(),
  uppercase: z
    .string()
    .describe('Whether to convert the message to uppercase')
    .optional(),
});

export type EchoPromptInput = z.infer<typeof EchoPromptInputSchema>;
