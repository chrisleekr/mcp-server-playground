import { GetPromptRequest } from '@modelcontextprotocol/sdk/types.js';

import { loggingContext, sendProgressNotification } from '@/core/server';
import {
  Prompt,
  PromptBuilder,
  PromptContext,
  PromptResult,
} from '@/prompts/types';

import { EchoPromptInputSchema } from './types';

async function* executeEchoPrompt(
  request: GetPromptRequest,
  context: PromptContext
): AsyncGenerator<PromptResult> {
  const progressToken = context.progressToken;

  loggingContext.log('info', `Progress token: ${progressToken}`);

  loggingContext.setContextValue('prompt', 'echo');

  try {
    loggingContext.log('info', 'Sending progress notification', {
      data: { request },
    });

    if (context.server) {
      await sendProgressNotification(context.server, {
        progressToken,
        progress: 0,
        total: 100,
        message: 'Starting echo prompt',
      });
    }

    const { name: promptName, arguments: args } = request.params;
    loggingContext.log('info', 'Executing echo prompt', {
      data: { promptName, args },
    });

    // Validate arguments to be of type EchoPromptInput
    const validatedArgs = EchoPromptInputSchema.parse(args);
    const { message, repeat, uppercase } = validatedArgs;

    if (context.server) {
      await sendProgressNotification(context.server, {
        progressToken,
        progress: 100,
        total: 100,
        message: 'Echo prompt completed',
      });
    }

    yield {
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Echo ${message ?? 'my message'}, repeat ${repeat ?? 1} times, ${uppercase !== '' ? `in ${uppercase}` : ''}`,
          },
        },
      ],
    };
  } catch (error) {
    loggingContext.log('error', 'Echo prompt execution failed', {
      data: {
        error: {
          message:
            error instanceof Error ? error.message : 'Unknown error occurred',
          stack: error instanceof Error ? error.stack : undefined,
        },
      },
    });

    yield {
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Echo my message`,
          },
        },
      ],
    };
  }
}

export const echoPrompt: Prompt<GetPromptRequest> =
  new PromptBuilder<GetPromptRequest>('echo')
    .description(
      'Echo a message back with optional transformations, repetition, and structured output support'
    )
    .arguments([
      {
        name: 'message',
        description: 'The message to echo',
        required: true,
      },
      {
        name: 'repeat',
        description: 'The number of times to repeat the message',
        required: false,
      },
      {
        name: 'uppercase',
        description: 'Whether to convert the message to uppercase',
        required: false,
      },
    ])
    .processImplementation(executeEchoPrompt)
    .build();
