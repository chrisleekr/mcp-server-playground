import { Bucket, ListObjectsV2Output } from '@aws-sdk/client-s3';
import { z } from 'zod';

import { ToolResultSchema } from '@/tools/types';

export interface BucketWithObjects extends Bucket {
  objects?: ListObjectsV2Output['Contents'];
}

export const AWSS3InputSchema = z.object({
  operation: z
    .enum(['listBuckets', 'listObjects'])
    .describe(
      'The operation to perform on the S3 bucket\n- listBuckets: list all buckets\n- listObjects: list all objects in a bucket'
    ),
  bucketPrefix: z
    .string()
    .describe(
      'The partial or full name of the S3 bucket\n- Required for listObjects operations'
    )
    .optional()
    .default(''),
  keyPrefix: z
    .string()
    .describe(
      'The partial or full key of the S3 object\n- Required for listObjects operations\n- If not provided, all objects matching the bucketPrefix will be listed'
    )
    .optional()
    .default(''),
});

export type AWSS3Input = z.infer<typeof AWSS3InputSchema>;

export const AWSS3OutputSchema = ToolResultSchema.extend({
  structuredContent: z.object({
    type: z.literal('structured'),
    content: z.object({
      buckets: z.array(
        z.object({
          name: z.string(),
          creationDate: z.string(),
          objects: z.array(
            z.object({
              key: z.string(),
              lastModified: z.string().or(z.date()),
              size: z.number(),
              storageClass: z.string(),
              owner: z
                .object({
                  displayName: z.string(),
                  id: z.string(),
                })
                .optional(),
            })
          ),
        })
      ),
    }),
    schema: z.object({
      type: z.literal('object'),
      properties: z.object({
        description: z.string().describe('The description of the S3 buckets'),
        buckets: z
          .array(
            z.object({
              name: z.string().describe('The name of the S3 bucket'),
              creationDate: z
                .string()
                .or(z.date())
                .describe('The creation date of the S3 bucket'),
              objects: z.array(
                z.object({
                  key: z.string().describe('The key of the S3 object'),
                  lastModified: z
                    .string()
                    .or(z.date())
                    .describe('The last modified date of the S3 object'),
                  size: z.number().describe('The size of the S3 object'),
                  storageClass: z
                    .string()
                    .describe('The storage class of the S3 object'),
                  owner: z
                    .object({
                      displayName: z
                        .string()
                        .describe('The display name of the owner'),
                      id: z.string().describe('The ID of the owner'),
                    })
                    .optional(),
                })
              ),
            })
          )
          .describe('The list of S3 buckets'),
      }),
    }),
    format: z.literal('json'),
  }),
});

export type AWSS3Output = z.infer<typeof AWSS3OutputSchema>;
