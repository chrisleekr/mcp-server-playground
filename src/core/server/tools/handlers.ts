import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequest,
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { toolLoader } from '@/tools/loader';
import { ToolContext } from '@/tools/types';

import { loggingContext } from '../http/context';

export function setupToolHandlers(
  server: Server,
  toolContext: ToolContext
): void {
  // List available tools
  server.setRequestHandler(ListToolsRequestSchema, () => {
    const tools = toolLoader.getToolDefinitions();
    return Promise.resolve({
      tools: tools.map(tool => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
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

export async function handleToolCall(
  request: CallToolRequest,
  toolContext: ToolContext
): Promise<Record<string, unknown>> {
  const { name, arguments: args } = request.params;
  loggingContext.log('debug', `Executing tool: ${name}`, { data: { args } });

  try {
    // Get tool from registry
    const tool = toolLoader.getTool(name);
    if (!tool) {
      loggingContext.log('error', 'Unknown tool', { data: { name } });
      throw new Error(`Unknown tool: ${name}`);
    }

    // Execute tool with context
    const result = await tool.execute(args ?? {}, toolContext);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (error) {
    loggingContext.log('error', 'Tool execution failed', {
      data: {
        error: {
          message: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : undefined,
        },
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
