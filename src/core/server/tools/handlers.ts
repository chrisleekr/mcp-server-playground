import {
  type CallToolRequest,
  CallToolRequestSchema,
  type CallToolResult,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { toolLoader } from '@/tools/loader';
import { type ToolContext } from '@/tools/types';

import { loggingContext } from '../http/context';

/**
 * Builds the CallToolResult response from a tool execution result.
 * Supports structuredContent and annotations per MCP 2025-06-18 spec.
 */
function buildToolResponse(finalResult: {
  success: boolean;
  structuredContent?: { content: unknown };
  annotations?: {
    audience?: ('user' | 'assistant')[];
    priority?: number;
    lastModified?: string;
  };
  [key: string]: unknown;
}): CallToolResult {
  const textContent: {
    type: 'text';
    text: string;
    annotations?: {
      audience?: ('user' | 'assistant')[];
      priority?: number;
      lastModified?: string;
    };
  } = {
    type: 'text',
    text: JSON.stringify(finalResult.structuredContent?.content ?? finalResult),
  };

  if (finalResult.annotations !== undefined) {
    textContent.annotations = finalResult.annotations;
  }

  const response: CallToolResult = {
    content: [textContent],
  };

  if (finalResult.structuredContent !== undefined) {
    response.structuredContent = finalResult.structuredContent
      .content as Record<string, unknown>;
  }

  return response;
}

export function setupToolHandlers(toolContext: ToolContext): void {
  const server = toolContext.server;
  if (!server) {
    throw new Error('Server not found');
  }

  // List available tools (MCP 2025-06-18 spec compliant)
  server.setRequestHandler(ListToolsRequestSchema, () => {
    const tools = toolLoader.getToolDefinitions();
    return Promise.resolve({
      tools: tools.map(tool => ({
        name: tool.name,
        title: tool.title,
        description: tool.description,
        inputSchema: tool.inputSchema,
        outputSchema: tool.outputSchema,
      })),
    });
  });

  // Handle tool execution
  server.setRequestHandler(
    CallToolRequestSchema,
    async (request: CallToolRequest) => {
      return handleToolCall(request, toolContext);
    }
  );
}

async function handleToolCall(
  request: CallToolRequest,
  toolContext: ToolContext
): Promise<CallToolResult> {
  const server = toolContext.server;
  if (!server) {
    throw new Error('Server not found');
  }

  const { name, arguments: args } = request.params;

  loggingContext.log('info', 'Handling tool call', {
    data: { toolName: name, arguments: args },
  });

  const tool = toolLoader.getTool(name);
  if (!tool) {
    throw new Error(`Tool not found: ${name}`);
  }

  try {
    // Add progress token to context if provided
    const requestWithMeta = request as CallToolRequest & {
      _meta?: { progressToken?: string | number };
    };
    // If no progress token is provided, generate a random one
    const progressToken =
      requestWithMeta._meta?.progressToken ??
      Math.random().toString(36).substring(2, 15);

    loggingContext.setContextValue('progressToken', progressToken);
    // Add progress token to tool context
    const toolContextWithProgressToken: ToolContext = {
      ...toolContext,
      progressToken,
    };

    const generator = tool.execute(args ?? {}, toolContextWithProgressToken);
    let finalResult: { success: boolean; [key: string]: unknown } | null = null;

    // Get the result from the generator and assign it to the final result
    for await (const result of generator) {
      finalResult = result;
    }

    // Ensure we have at least one result
    finalResult ??= {
      success: false,
      error: 'No results generated',
    };

    return buildToolResponse(finalResult);
  } catch (error: unknown) {
    loggingContext.log('error', 'Tool call failed', {
      data: {
        toolName: name,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      },
    });

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              success: false,
              error: error instanceof Error ? error.message : 'Unknown error',
              timestamp: new Date().toISOString(),
            },
            null,
            2
          ),
        },
      ],
      isError: true,
    };
  }
}

export function loadTools(): void {
  try {
    toolLoader.loadAllTools();
    loggingContext.log('info', 'All tools loaded successfully');
  } catch (error) {
    loggingContext.log('error', 'Failed to load tools', {
      error: {
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      },
    });
    throw error;
  }
}
