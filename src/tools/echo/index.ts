import { zodToJsonSchema } from 'zod-to-json-schema';

import { loggingContext } from '@/core/server/http/context';
import {
  Tool,
  ToolBuilder,
  ToolContext,
  ToolInputSchema,
  ToolResult,
} from '@/tools/types';

import { EchoInput, EchoInputSchema, EchoOutput } from './types';

/**
 * Echo tool implementation
 */
// eslint-disable-next-line @typescript-eslint/require-await
async function executeEcho(
  input: EchoInput,
  _context: ToolContext
): Promise<ToolResult & { data?: EchoOutput }> {
  loggingContext.setContextValue('tool', 'echo');
  const startTime = Date.now();

  try {
    loggingContext.log('debug', 'Executing echo tool', { data: { input } });

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

    return {
      success: true,
      data: output,
      executionTime,
      timestamp: new Date().toISOString(),
      metadata: {
        toolVersion: '1.0.0',
        originalLength: validatedInput.message.length,
        finalLength: repeatedMessage.length,
      },
    };
  } catch (error) {
    const executionTime = Date.now() - startTime;
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error occurred';

    loggingContext.log('error', 'Echo tool execution failed', {
      data: {
        error: errorMessage,
        input,
        executionTime,
      },
    });

    return {
      success: false,
      error: errorMessage,
      executionTime,
      timestamp: new Date().toISOString(),
      metadata: {
        toolVersion: '1.0.0',
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
    'Echo a message back with optional transformations and repetition'
  )
  .inputSchema(zodToJsonSchema(EchoInputSchema) as typeof ToolInputSchema)
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
      },
      description: 'Echo with repetition and uppercase transformation',
    },
  ])
  .tags(['utility', 'example', 'text'])
  .version('1.0.0')
  .timeout(2000)
  .implementation(executeEcho)
  .build();
