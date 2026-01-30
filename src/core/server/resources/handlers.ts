import {
  type ListResourcesRequest,
  ListResourcesRequestSchema,
  type ListResourceTemplatesRequest,
  ListResourceTemplatesRequestSchema,
  type ReadResourceRequest,
  ReadResourceRequestSchema,
  type ReadResourceResult,
} from '@modelcontextprotocol/sdk/types.js';

import { resourceLoader } from '@/resources/loader';
import { type ResourceContext } from '@/resources/types';

import { DEFAULT_PAGE_SIZE } from '../constants';
import { loggingContext } from '../http/context';

/**
 * Parses a cursor string to get the offset.
 * Cursor is base64 encoded offset number.
 */
function parseCursor(cursor: string | undefined): number {
  if (cursor === undefined) {
    return 0;
  }
  try {
    const offset = parseInt(
      Buffer.from(cursor, 'base64').toString('utf-8'),
      10
    );
    if (isNaN(offset) || offset < 0) {
      return 0;
    }
    return offset;
  } catch {
    return 0;
  }
}

/**
 * Creates a cursor string from an offset.
 */
function createCursor(offset: number): string {
  return Buffer.from(offset.toString()).toString('base64');
}

/**
 * Sets up MCP resource handlers per MCP 2025-06-18 specification.
 *
 * @see https://modelcontextprotocol.io/specification/2025-06-18/server/resources
 */
export function setupResourcesHandlers(resourceContext: ResourceContext): void {
  const server = resourceContext.server;
  if (!server) {
    throw new Error('Server not found');
  }

  // List available resources with pagination (MCP 2025-06-18 spec compliant)
  server.setRequestHandler(
    ListResourcesRequestSchema,
    (request: ListResourcesRequest) => {
      const allResources = resourceLoader.getResourceDefinitions();
      const offset = parseCursor(request.params?.cursor);
      const pageSize = DEFAULT_PAGE_SIZE;

      const paginatedResources = allResources.slice(offset, offset + pageSize);
      const hasMore = offset + pageSize < allResources.length;
      const nextCursor = hasMore ? createCursor(offset + pageSize) : undefined;

      return Promise.resolve({
        resources: paginatedResources.map(resource => ({
          uri: resource.uri,
          name: resource.name,
          title: resource.title,
          description: resource.description,
          mimeType: resource.mimeType,
          size: resource.size,
          annotations: resource.annotations,
        })),
        nextCursor,
      });
    }
  );

  // List resource templates with pagination (MCP 2025-06-18 spec compliant)
  server.setRequestHandler(
    ListResourceTemplatesRequestSchema,
    (request: ListResourceTemplatesRequest) => {
      const allTemplates = resourceLoader.getTemplateDefinitions();
      const offset = parseCursor(request.params?.cursor);
      const pageSize = DEFAULT_PAGE_SIZE;

      const paginatedTemplates = allTemplates.slice(offset, offset + pageSize);
      const hasMore = offset + pageSize < allTemplates.length;
      const nextCursor = hasMore ? createCursor(offset + pageSize) : undefined;

      return Promise.resolve({
        resourceTemplates: paginatedTemplates.map(template => ({
          uriTemplate: template.uriTemplate,
          name: template.name,
          title: template.title,
          description: template.description,
          mimeType: template.mimeType,
          annotations: template.annotations,
        })),
        nextCursor,
      });
    }
  );

  // Read a resource by URI (MCP 2025-06-18 spec compliant)
  server.setRequestHandler(
    ReadResourceRequestSchema,
    async (request: ReadResourceRequest) => {
      return handleResourceRead(request, resourceContext);
    }
  );
}

async function handleResourceRead(
  request: ReadResourceRequest,
  resourceContext: ResourceContext
): Promise<ReadResourceResult> {
  const { uri } = request.params;

  loggingContext.log('info', 'Handling resource read', {
    data: { uri },
  });

  // First, try to find an exact match
  const resource = resourceLoader.getResource(uri);
  if (resource) {
    try {
      return await resource.read(uri, resourceContext);
    } catch (error: unknown) {
      loggingContext.log('error', 'Resource read failed', {
        data: { uri },
        error: {
          message: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : undefined,
        },
      });
      throw new Error(
        `Failed to read resource: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  // If no exact match, try to find a matching template
  const templateMatch = resourceLoader.findTemplateForUri(uri);
  if (templateMatch) {
    try {
      return await templateMatch.template.read(uri, resourceContext);
    } catch (error: unknown) {
      loggingContext.log('error', 'Resource template read failed', {
        data: { uri, template: templateMatch.template.definition.uriTemplate },
        error: {
          message: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : undefined,
        },
      });
      throw new Error(
        `Failed to read resource from template: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  // Resource not found - throw standard error per MCP spec
  loggingContext.log('warn', 'Resource not found', { data: { uri } });
  throw new Error(`Resource not found: ${uri}`);
}

/**
 * Loads all resources into the registry.
 */
export function loadResources(): void {
  try {
    resourceLoader.loadAllResources();
    loggingContext.log('info', 'All resources loaded successfully');
  } catch (error) {
    loggingContext.log('error', 'Failed to load resources', {
      error: {
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      },
    });
    throw error;
  }
}
