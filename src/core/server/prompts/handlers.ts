import {
  type GetPromptRequest,
  GetPromptRequestSchema,
  type GetPromptResult,
  type ListPromptsRequest,
  ListPromptsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { loggingContext } from '@/core/server';
import { promptLoader } from '@/prompts/loader';
import { type PromptContext } from '@/prompts/types';

import { DEFAULT_PAGE_SIZE } from '../constants';

export function setupPromptsHandlers(promptContext: PromptContext): void {
  const server = promptContext.server;
  if (!server) {
    throw new Error('Server not found');
  }

  // List available prompts with pagination support (MCP 2025-06-18 spec compliant)
  server.setRequestHandler(
    ListPromptsRequestSchema,
    (request: ListPromptsRequest) => {
      const allPrompts = promptLoader.getPromptDefinitions();
      const cursor = request.params?.cursor;

      // Parse cursor to get offset (cursor is base64 encoded offset)
      let offset = 0;
      if (cursor !== undefined) {
        try {
          offset = parseInt(
            Buffer.from(cursor, 'base64').toString('utf-8'),
            10
          );
          if (isNaN(offset) || offset < 0) {
            offset = 0;
          }
        } catch {
          offset = 0;
        }
      }

      // Get page of prompts
      const pageSize = DEFAULT_PAGE_SIZE;
      const paginatedPrompts = allPrompts.slice(offset, offset + pageSize);
      const hasMore = offset + pageSize < allPrompts.length;

      // Create next cursor if there are more items
      const nextCursor = hasMore
        ? Buffer.from((offset + pageSize).toString()).toString('base64')
        : undefined;

      return Promise.resolve({
        prompts: paginatedPrompts.map(prompt => ({
          name: prompt.name,
          description: prompt.description,
          arguments: prompt.arguments,
        })),
        nextCursor,
      });
    }
  );

  // Get prompt
  server.setRequestHandler(
    GetPromptRequestSchema,
    async (request: GetPromptRequest) => {
      return handlePromptCall(request, promptContext);
    }
  );
}

export function loadPrompts(): void {
  try {
    promptLoader.loadAllPrompts();
    loggingContext.log('info', 'All prompts loaded successfully');
  } catch (error) {
    loggingContext.log('error', 'Failed to load prompts', {
      error: {
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      },
    });
    throw error;
  }
}

async function handlePromptCall(
  request: GetPromptRequest,
  promptContext: PromptContext
): Promise<GetPromptResult> {
  const server = promptContext.server;
  if (!server) {
    throw new Error('Server not found');
  }

  const { name } = request.params;

  const prompt = promptLoader.getPrompt(name);
  if (!prompt) {
    throw new Error(`Prompt not found: ${name}`);
  }

  try {
    // Add progress token to context if provided
    const requestWithMeta = request as GetPromptRequest & {
      _meta?: { progressToken?: string | number };
    };
    // If no progress token is provided, generate a random one
    const progressToken =
      requestWithMeta._meta?.progressToken ??
      Math.random().toString(36).substring(2, 15);

    loggingContext.setContextValue('progressToken', progressToken);

    const promptContextWithProgressToken: PromptContext = {
      ...promptContext,
      progressToken,
    };

    const generator = prompt.process(request, promptContextWithProgressToken);
    let finalResult: GetPromptResult | null = null;

    // Get the result from the generator and assign it to the final result
    for await (const result of generator) {
      finalResult = result;
    }

    // Ensure we have at least one result
    finalResult ??= {
      messages: [],
    };

    return finalResult;
  } catch (error: unknown) {
    loggingContext.log('error', 'Prompt call failed', {
      data: {
        promptName: name,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      },
    });

    return {
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Prompt call failed: ${
              error instanceof Error ? error.message : 'Unknown error'
            }`,
          },
        },
      ],
    };
  }
}
