/* eslint-disable max-lines-per-function */

import { zodToJsonSchema } from 'zod-to-json-schema';

import { loggingContext } from '@/core/server/http/context';
import {
  createResourceLink,
  createStructuredContent,
  Tool,
  ToolBuilder,
  ToolContext,
  ToolInputSchema,
  ToolResult,
} from '@/tools/types';

import packageJson from '../../../package.json';
import { sendProgressNotification } from '../notification';
import { EchoInput, EchoInputSchema, EchoOutput } from './types';

/**
 * Echo tool implementation
 */

async function* executeEcho(
  input: EchoInput,
  context: ToolContext
): AsyncGenerator<ToolResult & { data?: EchoOutput }> {
  const progressToken = context.progressToken;

  loggingContext.log('info', `Progress token: ${progressToken}`);

  loggingContext.setContextValue('tool', 'echo');
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
    const validatedInput = EchoInputSchema.parse(input);

    // Process the message
    let processedMessage = validatedInput.message;
    if (validatedInput.uppercase) {
      processedMessage = processedMessage.toUpperCase();
    }

    // Repeat the message
    const repeatedMessage = Array(validatedInput.repeat)
      .fill(processedMessage)
      .join(' ');

    // Send completion notification
    if (context.server) {
      await sendProgressNotification(context.server, {
        progressToken,
        progress: 100,
        total: 100,
        message: 'Echo tool completed',
      });
    }

    // Prepare output
    const output: EchoOutput = {
      originalMessage: validatedInput.message,
      processedMessage: repeatedMessage,
      repeat: validatedInput.repeat,
      uppercase: validatedInput.uppercase,
      length: repeatedMessage.length,
    };

    const executionTime = Date.now() - startTime;

    loggingContext.log('info', 'Echo tool executed successfully', {
      data: {
        messageLength: validatedInput.message.length,
        repeat: validatedInput.repeat,
        executionTime,
      },
    });

    // Create structured content for the new MCP spec
    const structuredOutput = createStructuredContent(
      output,
      {
        type: 'object',
        properties: {
          originalMessage: {
            type: 'string',
            description: 'The original input message',
          },
          processedMessage: {
            type: 'string',
            description: 'The processed output message',
          },
          repeat: {
            type: 'number',
            description: 'Number of repetitions applied',
          },
          uppercase: {
            type: 'boolean',
            description: 'Whether uppercase transformation was applied',
          },
          length: {
            type: 'number',
            description: 'Length of the final processed message',
          },
        },
        required: [
          'originalMessage',
          'processedMessage',
          'repeat',
          'uppercase',
          'length',
        ],
      },
      'json'
    );

    // Create example resource links
    const resourceLinks = [
      createResourceLink(
        'echo://documentation',
        'Echo Tool Documentation',
        'Documentation for the echo tool functionality',
        'text/markdown'
      ),
      createResourceLink(
        `echo://result/${Date.now()}`,
        'Echo Result',
        'The result of this echo operation',
        'application/json'
      ),
    ];

    yield {
      success: true,
      data: output,
      executionTime,
      timestamp: new Date().toISOString(),
      metadata: {
        toolVersion: packageJson.version,
        mcpSpecVersion: '2025-06-18',
        originalLength: validatedInput.message.length,
        finalLength: repeatedMessage.length,
        features: ['structured_output', 'resource_links'],
      },
      structuredContent: structuredOutput,
      resourceLinks,
    };
  } catch (error) {
    const executionTime = Date.now() - startTime;
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error occurred';

    loggingContext.log('error', 'Echo tool execution failed', {
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
 * Create and export the echo tool
 */
export const echoTool: Tool<EchoInput, EchoOutput> = new ToolBuilder<
  EchoInput,
  EchoOutput
>('echo')
  .description(
    'Echo a message back with optional transformations, repetition, and structured output support'
  )
  .inputSchema(zodToJsonSchema(EchoInputSchema) as typeof ToolInputSchema)
  .outputSchema({
    type: 'object',
    properties: {
      originalMessage: {
        type: 'string',
        description: 'The original input message',
      },
      processedMessage: {
        type: 'string',
        description: 'The processed output message',
      },
      repeat: { type: 'number', description: 'Number of repetitions applied' },
      uppercase: {
        type: 'boolean',
        description: 'Whether uppercase transformation was applied',
      },
      length: {
        type: 'number',
        description: 'Length of the final processed message',
      },
    },
    required: [
      'originalMessage',
      'processedMessage',
      'repeat',
      'uppercase',
      'length',
    ],
  })
  .examples([
    {
      input: { message: 'Hello, World!' },
      output: {
        success: true,
        data: {
          originalMessage: 'Hello, World!',
          processedMessage: 'Hello, World!',
          repeat: 1,
          uppercase: false,
          length: 13,
        },
        structuredContent: {
          type: 'structured',
          content: {
            originalMessage: 'Hello, World!',
            processedMessage: 'Hello, World!',
            repeat: 1,
            uppercase: false,
            length: 13,
          },
          format: 'json',
        },
        resourceLinks: [
          {
            type: 'resource_link',
            uri: 'echo://documentation',
            name: 'Echo Tool Documentation',
            description: 'Documentation for the echo tool functionality',
            mimeType: 'text/markdown',
          },
        ],
      },
      description: 'Simple echo example',
    },
    {
      input: { message: 'Hello', repeat: 3, uppercase: true },
      output: {
        success: true,
        data: {
          originalMessage: 'Hello',
          processedMessage: 'HELLO HELLO HELLO',
          repeat: 3,
          uppercase: true,
          length: 17,
        },
        structuredContent: {
          type: 'structured',
          content: {
            originalMessage: 'Hello',
            processedMessage: 'HELLO HELLO HELLO',
            repeat: 3,
            uppercase: true,
            length: 17,
          },
          format: 'json',
        },
      },
      description: 'Echo with repetition and uppercase transformation',
    },
  ])
  .tags(['utility', 'example', 'text'])
  .version(packageJson.version)
  .timeout(2000)
  .streamingImplementation(executeEcho)
  .build();
