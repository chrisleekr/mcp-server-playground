/* eslint-disable max-lines-per-function */
import { zodToJsonSchema } from 'zod-to-json-schema';

import { loggingContext, sendProgressNotification } from '@/core/server';
import { listBuckets, listObjectsV2 } from '@/libraries/aws';
import {
  createStructuredContent,
  Tool,
  ToolBuilder,
  ToolContext,
  ToolInputSchema,
  ToolResult,
} from '@/tools/types';

import packageJson from '../../../../package.json';
import {
  AWSS3Input,
  AWSS3InputSchema,
  AWSS3Output,
  AWSS3OutputSchema,
  BucketWithObjects,
} from './types';

async function* executeAWSS3(
  input: AWSS3Input,
  context: ToolContext
): AsyncGenerator<ToolResult & { data?: AWSS3Output }> {
  const progressToken = context.progressToken;

  loggingContext.log('info', `Progress token: ${progressToken}`);

  loggingContext.setContextValue('tool', 'aws-s3');
  const startTime = Date.now();

  try {
    loggingContext.log('debug', 'Executing AWS S3 tool', { data: { input } });

    // Send mid-progress notification
    if (context.server) {
      await sendProgressNotification(context.server, {
        progressToken,
        progress: 0,
        total: 100,
        message: 'Starting AWS S3 tool',
      });
    }

    // Validate input using Zod schema
    const validatedInput = AWSS3InputSchema.parse(input);

    // Get S3 client
    let buckets: BucketWithObjects[] = [];

    switch (validatedInput.operation) {
      case 'listBuckets':
        buckets =
          (
            await listBuckets({
              prefix: validatedInput.bucketPrefix,
            })
          ).Buckets ?? [];

        break;
      case 'listObjects':
        buckets =
          (
            await listBuckets({
              prefix: validatedInput.bucketPrefix,
            })
          ).Buckets ?? [];

        // Loop buckets and get objects
        for (const [index, bucket] of buckets.entries()) {
          loggingContext.log('info', 'Listing objects', {
            data: { bucket },
          });

          // This is slow if there are many buckets. Use Promise.all to speed it up.
          buckets[index] = {
            ...bucket,
            objects:
              (
                await listObjectsV2({
                  bucket: bucket.Name ?? '',
                  region: bucket.BucketRegion ?? '',
                  prefix: validatedInput.keyPrefix,
                })
              ).Contents ?? [],
          };
        }

        break;
    }

    loggingContext.log('info', 'Buckets', { data: { buckets } });

    if (context.server) {
      await sendProgressNotification(context.server, {
        progressToken,
        progress: 100,
        total: 100,
        message: 'AWS S3 tool completed',
      });
    }

    const output: AWSS3Output['structuredContent']['content'] = {
      buckets: buckets.map(bucket => ({
        name: bucket.Name ?? '',
        creationDate: bucket.CreationDate?.toISOString() ?? '',
        objects:
          bucket.objects?.map(object => ({
            key: object.Key ?? '',
            lastModified: object.LastModified?.toISOString() ?? '',
            size: object.Size ?? 0,
            storageClass: object.StorageClass ?? '',
            owner: {
              displayName: object.Owner?.DisplayName ?? '',
              id: object.Owner?.ID ?? '',
            },
          })) ?? [],
      })),
    };

    // Create a resource link
    const executionTime = Date.now() - startTime;

    // Create structured content for the new MCP spec
    const structuredOutput = createStructuredContent(
      output,
      zodToJsonSchema(AWSS3OutputSchema.shape.structuredContent.shape.content),
      'json'
    );

    loggingContext.log('info', 'AWS S3 tool executed successfully', {
      data: {
        bucketPrefix: input.bucketPrefix,
        keyPrefix: input.keyPrefix,
        executionTime,
      },
    });

    yield {
      success: true,
      executionTime,
      timestamp: new Date().toISOString(),
      metadata: {
        toolVersion: packageJson.version,
        mcpSpecVersion: '2025-06-18',
      },
      structuredContent: structuredOutput,
    };
  } catch (error) {
    const executionTime = Date.now() - startTime;
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error occurred';

    loggingContext.log('error', 'AWS S3 tool execution failed', {
      data: {
        error: {
          message: errorMessage,
          stack: error instanceof Error ? error.stack : undefined,
        },
        input,
        executionTime,
      },
    });

    yield {
      success: false,
      error: errorMessage,
      executionTime,
      timestamp: new Date().toISOString(),
      metadata: {
        toolVersion: packageJson.version,
        inputValidation: 'failed',
      },
    };
  }
}

/**
 * Create and export the AWS S3 tool
 */
export const awsS3Tool: Tool<AWSS3Input, AWSS3Output> = new ToolBuilder<
  AWSS3Input,
  AWSS3Output
>('aws_s3')
  .description('Get the list of S3 buckets and objects')
  .inputSchema(zodToJsonSchema(AWSS3InputSchema) as typeof ToolInputSchema)
  .outputSchema(zodToJsonSchema(AWSS3OutputSchema))
  .examples([
    {
      input: { operation: 'listBuckets', bucketPrefix: 'my-bucket' },
      output: {
        success: true,
        structuredContent: {
          type: 'structured',
          content: {
            buckets: [
              {
                name: 'my-bucket',
                creationDate: '2021-01-01',
                objects: [
                  {
                    key: 'my-key',
                    lastModified: '2021-01-01',
                    size: 100,
                    storageClass: 'STANDARD',
                    owner: {
                      displayName: 'my-owner',
                      id: 'my-id',
                    },
                  },
                ],
              },
            ],
          },
          schema: zodToJsonSchema(
            AWSS3OutputSchema.shape.structuredContent.shape.schema
          ),
          format: 'json',
        },
      },
      description: 'Get the list of S3 buckets and objects',
    },
  ])
  .tags(['aws', 's3', 'storage'])
  .version(packageJson.version)
  .timeout(2000)
  .streamingImplementation(executeAWSS3)
  .build();
