import { type Server } from '@modelcontextprotocol/sdk/server/index.js';
import { ToolSchema } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

import { type ProgressToken } from '@/core/server';

/**
 * Tool execution context for dependency injection and configuration
 */

export interface ToolContext {
  config: Record<string, unknown>;
  progressToken: ProgressToken;
  server?: Server;
}

/**
 * Resource link for pointing to external resources
 */
export interface ResourceLink {
  type: 'resource_link';
  uri: string;
  name?: string;
  description?: string;
  mimeType?: string;
}

/**
 * Structured content for tool results
 */
export interface StructuredContent {
  type: 'structured';
  content: unknown;
  schema?: Record<string, unknown>;
  format?: 'json' | 'yaml' | 'xml';
}

/**
 * Content annotations for tool results per MCP 2025-06-18 specification.
 * Provides metadata about audience, priority, and modification times.
 *
 * @see https://modelcontextprotocol.io/specification/2025-06-18/server/tools#tool-result
 */
export interface ContentAnnotations {
  /** Hints whether content is for the user, assistant, or both */
  audience?: ('user' | 'assistant')[];
  /** Relative importance (0.0 to 1.0) */
  priority?: number;
  /** ISO 8601 timestamp when the data was last modified */
  lastModified?: string;
}

/**
 * Zod schema for content annotations validation
 */
export const ContentAnnotationsSchema = z.object({
  audience: z.array(z.enum(['user', 'assistant'])).optional(),
  priority: z.number().min(0).max(1).optional(),
  lastModified: z.string().optional(),
});

/**
 * Tool result schema with structured output support
 */
export const ToolResultSchema = z.object({
  success: z.boolean(),
  data: z.unknown().optional(),
  error: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
  executionTime: z.number().optional(),
  timestamp: z.string().optional(),
  /** Optional annotations for the content (MCP 2025-06-18) */
  annotations: ContentAnnotationsSchema.optional(),
  structuredContent: z
    .object({
      type: z.literal('structured'),
      content: z.unknown(),
      schema: z.record(z.unknown()).optional(),
      format: z.enum(['json', 'yaml', 'xml']).optional(),
    })
    .optional(),
  resourceLinks: z
    .array(
      z.object({
        type: z.literal('resource_link'),
        uri: z.string(),
        name: z.string().optional(),
        description: z.string().optional(),
        mimeType: z.string().optional(),
      })
    )
    .optional(),
});

export type ToolResult = z.infer<typeof ToolResultSchema>;

export const ToolInputSchema = ToolSchema.shape.inputSchema;

/**
 * Tool definition interface
 *
 * @see https://modelcontextprotocol.io/specification/2025-06-18/server/tools
 */
export interface ToolDefinition {
  name: string;
  /** Human-readable display name for the tool (new in MCP 2025-06-18) */
  title?: string;
  description: string;
  inputSchema: typeof ToolInputSchema;
  examples?: Array<{
    input: Record<string, unknown>;
    output: ToolResult;
    description: string;
  }>;
  tags?: string[];
  version?: string;
  timeout?: number;
  outputSchema?: Record<string, unknown>;
  supportsStructuredOutput?: boolean;
}

/**
 * Streaming tool execution function interface using AsyncGenerator
 */
export type StreamingToolFunction<
  TInput = Record<string, unknown>,
  TOutput = unknown,
> = (
  input: TInput,
  context: ToolContext
) => AsyncGenerator<ToolResult & { data?: TOutput }>;

/**
 * Complete tool interface combining definition and implementation
 */
export interface Tool<TInput = Record<string, unknown>, TOutput = unknown> {
  definition: ToolDefinition;
  execute: StreamingToolFunction<TInput, TOutput>;
}

/**
 * Tool builder utility for creating tools with validation
 */
export class ToolBuilder<TInput = Record<string, unknown>, TOutput = unknown> {
  private toolDefinition: Partial<ToolDefinition> = {};
  private toolFunction?: StreamingToolFunction<TInput, TOutput>;

  constructor(name: string) {
    this.toolDefinition.name = name;
  }

  public description(desc: string): this {
    this.toolDefinition.description = desc;
    return this;
  }

  public title(title: string): this {
    this.toolDefinition.title = title;
    return this;
  }

  public inputSchema(schema: typeof ToolInputSchema): this {
    this.toolDefinition.inputSchema = schema;
    return this;
  }

  public outputSchema(schema: Record<string, unknown>): this {
    this.toolDefinition.outputSchema = schema;
    this.toolDefinition.supportsStructuredOutput = true;
    return this;
  }

  public examples(examples: ToolDefinition['examples']): this {
    if (examples !== undefined) {
      this.toolDefinition.examples = examples;
    }
    return this;
  }

  public tags(tags: string[]): this {
    this.toolDefinition.tags = tags;
    return this;
  }

  public version(version: string): this {
    this.toolDefinition.version = version;
    return this;
  }

  public timeout(timeout: number): this {
    this.toolDefinition.timeout = timeout;
    return this;
  }

  public streamingImplementation(
    fn: StreamingToolFunction<TInput, TOutput>
  ): this {
    this.toolFunction = fn;
    return this;
  }

  public build(): Tool<TInput, TOutput> {
    if (
      this.toolDefinition.name === undefined ||
      this.toolDefinition.description === undefined ||
      this.toolFunction === undefined
    ) {
      throw new Error(
        'Tool name, description, and implementation are required'
      );
    }

    return {
      definition: this.toolDefinition as ToolDefinition,
      execute: this.toolFunction,
    };
  }
}

/**
 * Utility function to create structured content
 */
export function createStructuredContent(
  content: unknown,
  schema?: Record<string, unknown>,
  format?: 'json' | 'yaml' | 'xml'
): StructuredContent {
  const result: StructuredContent = {
    type: 'structured',
    content,
  };

  if (schema !== undefined) {
    result.schema = schema;
  }

  if (format !== undefined) {
    result.format = format;
  }

  return result;
}

/**
 * Utility function to create resource links
 */
export function createResourceLink(
  uri: string,
  name?: string,
  description?: string,
  mimeType?: string
): ResourceLink {
  const result: ResourceLink = {
    type: 'resource_link',
    uri,
  };

  if (name !== undefined) {
    result.name = name;
  }

  if (description !== undefined) {
    result.description = description;
  }

  if (mimeType !== undefined) {
    result.mimeType = mimeType;
  }

  return result;
}
