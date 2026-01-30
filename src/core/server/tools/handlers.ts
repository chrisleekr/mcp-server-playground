import {
  type AudioContent as MCPAudioContent,
  type CallToolRequest,
  CallToolRequestSchema,
  type CallToolResult,
  type EmbeddedResource as MCPEmbeddedResource,
  type ImageContent as MCPImageContent,
  type ListToolsRequest,
  ListToolsRequestSchema,
  type ResourceLink as MCPResourceLink,
  type TextContent as MCPTextContent,
} from '@modelcontextprotocol/sdk/types.js';

import { toolLoader } from '@/tools/loader';
import {
  type AudioContent,
  type ContentAnnotations,
  type EmbeddedResource,
  type ImageContent,
  type ResourceLink,
  type ToolContext,
} from '@/tools/types';

import { DEFAULT_PAGE_SIZE } from '../constants';
import { loggingContext } from '../http/context';

type ContentItem =
  | MCPTextContent
  | MCPImageContent
  | MCPAudioContent
  | MCPResourceLink
  | MCPEmbeddedResource;

interface ToolExecutionResult {
  success: boolean;
  structuredContent?: { content: unknown };
  annotations?: ContentAnnotations;
  imageContent?: ImageContent[];
  audioContent?: AudioContent[];
  resourceLinks?: ResourceLink[];
  embeddedResources?: EmbeddedResource[];
  [key: string]: unknown;
}

function buildImageContent(images: ImageContent[]): MCPImageContent[] {
  return images.map(img => {
    const item: MCPImageContent = {
      type: 'image',
      data: img.data,
      mimeType: img.mimeType,
    };
    if (img.annotations !== undefined) {
      item.annotations = img.annotations;
    }
    return item;
  });
}

function buildAudioContent(audios: AudioContent[]): MCPAudioContent[] {
  return audios.map(audio => {
    const item: MCPAudioContent = {
      type: 'audio',
      data: audio.data,
      mimeType: audio.mimeType,
    };
    if (audio.annotations !== undefined) {
      item.annotations = audio.annotations;
    }
    return item;
  });
}

function buildResourceLinks(links: ResourceLink[]): MCPResourceLink[] {
  return links.map(link => {
    const item: MCPResourceLink = {
      type: 'resource_link',
      uri: link.uri,
      name: link.name ?? link.uri,
    };
    if (link.description !== undefined) {
      item.description = link.description;
    }
    if (link.mimeType !== undefined) {
      item.mimeType = link.mimeType;
    }
    if (link.annotations !== undefined) {
      item.annotations = link.annotations;
    }
    return item;
  });
}

function buildEmbeddedResources(
  resources: EmbeddedResource[]
): MCPEmbeddedResource[] {
  return resources.map(
    embedded =>
      ({ type: 'resource', resource: embedded.resource }) as MCPEmbeddedResource
  );
}

/**
 * Builds the CallToolResult response from a tool execution result.
 * Supports text, image, audio, resource links, embedded resources,
 * and structuredContent per MCP 2025-06-18 spec.
 */
function buildToolResponse(finalResult: ToolExecutionResult): CallToolResult {
  const textContent: MCPTextContent = {
    type: 'text',
    text: JSON.stringify(finalResult.structuredContent?.content ?? finalResult),
  };

  if (finalResult.annotations !== undefined) {
    textContent.annotations = finalResult.annotations;
  }

  const content: ContentItem[] = [textContent];

  if (finalResult.imageContent !== undefined) {
    content.push(...buildImageContent(finalResult.imageContent));
  }

  if (finalResult.audioContent !== undefined) {
    content.push(...buildAudioContent(finalResult.audioContent));
  }

  if (finalResult.resourceLinks !== undefined) {
    content.push(...buildResourceLinks(finalResult.resourceLinks));
  }

  if (finalResult.embeddedResources !== undefined) {
    content.push(...buildEmbeddedResources(finalResult.embeddedResources));
  }

  const response: CallToolResult = { content };

  if (finalResult.structuredContent !== undefined) {
    response.structuredContent = finalResult.structuredContent
      .content as Record<string, unknown>;
  }

  if (finalResult.success === false) {
    response.isError = true;
  }

  return response;
}

export function setupToolHandlers(toolContext: ToolContext): void {
  const server = toolContext.server;
  if (!server) {
    throw new Error('Server not found');
  }

  // List available tools with pagination support (MCP 2025-06-18 spec compliant)
  server.setRequestHandler(
    ListToolsRequestSchema,
    (request: ListToolsRequest) => {
      const allTools = toolLoader.getToolDefinitions();
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

      // Get page of tools
      const pageSize = DEFAULT_PAGE_SIZE;
      const paginatedTools = allTools.slice(offset, offset + pageSize);
      const hasMore = offset + pageSize < allTools.length;

      // Create next cursor if there are more items
      const nextCursor = hasMore
        ? Buffer.from((offset + pageSize).toString()).toString('base64')
        : undefined;

      return Promise.resolve({
        tools: paginatedTools.map(tool => ({
          name: tool.name,
          title: tool.title,
          description: tool.description,
          inputSchema: tool.inputSchema,
          outputSchema: tool.outputSchema,
          annotations: tool.annotations,
        })),
        nextCursor,
      });
    }
  );

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
