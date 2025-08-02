import { z } from 'zod';

export const AWSS3InputSchema = z.object({
  bucket: z.string().describe('The name of the S3 bucket'),
  key: z.string().describe('The key of the S3 object'),
});

export type AWSS3Input = z.infer<typeof AWSS3InputSchema>;

export interface AWSS3Output {
  bucket: string;
  key: string;
  content: string;
}
