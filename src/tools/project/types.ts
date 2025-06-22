import { z } from 'zod';

export const ProjectInputSchema = z.object({
  keywords: z.array(z.string()),
});

export type ProjectInput = z.infer<typeof ProjectInputSchema>;

export const ProjectOutputSchema = z.object({
  files: z.array(z.string()),
});

export type ProjectOutput = z.infer<typeof ProjectOutputSchema>;
