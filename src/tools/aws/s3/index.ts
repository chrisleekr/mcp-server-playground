import { zodToJsonSchema } from 'zod-to-json-schema';

import { loggingContext, sendProgressNotification } from '@/core/server';
import {
  createStructuredContent,
  Tool,
  ToolBuilder,
  ToolContext,
  ToolInputSchema,
  ToolResult,
} from '@/tools/types';

import packageJson from '../../../../package.json';
import { AWSS3Input, AWSS3InputSchema, AWSS3Output } from './types';

async function* executeAWSS3(
  input: AWSS3Input,
  context: ToolContext
): AsyncGenerator<ToolResult & { data?: AWSS3Output }> {
  const progressToken = context.progressToken;

  loggingContext.log('info', `Progress token: ${progressToken}`);

  loggingContext.setContextValue('tool', 'aws-s3');
  const startTime = Date.now();

  try {
    loggingContext.log('debug', 'Executing echo tool', { data: { input } });

    // Send mid-progress notification
    if (context.server) {
      await sendProgressNotification(context.server, {
        progressToken,
        progress: 0,
        total: 100,
        message: 'Starting echo tool',
      });
    }

    // Validate input using Zod schema
    const validatedInput = AWSS3InputSchema.parse(input);

    // TODO: Do something

    if (context.server) {
      await sendProgressNotification(context.server, {
        progressToken,
        progress: 100,
        total: 100,
        message: 'AWS S3 tool completed',
      });
    }

    // TODO: Prepare output
    const output: AWSS3Output = {
      bucket: validatedInput.bucket,
      key: validatedInput.key,
      content: 'Hello, world!',
    };

    // Create a resource link
    const executionTime = Date.now() - startTime;

    // Create structured content for the new MCP spec
    const structuredOutput = createStructuredContent(
      output,
      {
        type: 'object',
        properties: {
          bucket: {
            type: 'string',
            description: 'The name of the S3 bucket',
          },
          key: {
            type: 'string',
            description: 'The key of the S3 object',
          },
          content: {
            type: 'string',
            description: 'The content of the S3 object',
          },
        },
        required: ['bucket', 'key', 'content'],
      },
      'json'
    );

    loggingContext.log('info', 'AWS S3 tool executed successfully', {
      data: {
        bucket: input.bucket,
        key: input.key,
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
      data: output,
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
>('aws-s3')
  .description('Get the content of an S3 object')
  .inputSchema(zodToJsonSchema(AWSS3InputSchema) as typeof ToolInputSchema)
  .outputSchema({
    type: 'object',
    properties: {
      bucket: { type: 'string', description: 'The name of the S3 bucket' },
      key: { type: 'string', description: 'The key of the S3 object' },
      content: { type: 'string', description: 'The content of the S3 object' },
    },
  })
  .examples([
    {
      input: { bucket: 'my-bucket', key: 'my-key' },
      output: {
        success: true,
        data: {
          bucket: 'my-bucket',
          key: 'my-key',
          content: 'Hello, world!',
        },
        structuredContent: {
          type: 'structured',
          content: {
            bucket: 'my-bucket',
            key: 'my-key',
            content: 'Hello, world!',
          },
        },
      },
      description: 'Get the content of an S3 object',
    },
  ])
  .tags(['aws', 's3', 'storage'])
  .version(packageJson.version)
  .timeout(2000)
  .streamingImplementation(executeAWSS3)
  .build();
