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
 * Text content for tool results per MCP 2025-06-18 specification.
 *
 * @see https://modelcontextprotocol.io/specification/2025-06-18/server/tools#text-content
 */
export interface TextContent {
  type: 'text';
  text: string;
  annotations?: ContentAnnotations;
}

/**
 * Image content for tool results per MCP 2025-06-18 specification.
 *
 * @see https://modelcontextprotocol.io/specification/2025-06-18/server/tools#image-content
 */
export interface ImageContent {
  type: 'image';
  /** Base64-encoded image data */
  data: string;
  /** MIME type of the image (e.g., 'image/png', 'image/jpeg') */
  mimeType: string;
  annotations?: ContentAnnotations;
}

/**
 * Audio content for tool results per MCP 2025-06-18 specification.
 *
 * @see https://modelcontextprotocol.io/specification/2025-06-18/server/tools#audio-content
 */
export interface AudioContent {
  type: 'audio';
  /** Base64-encoded audio data */
  data: string;
  /** MIME type of the audio (e.g., 'audio/wav', 'audio/mp3', 'audio/mpeg') */
  mimeType: string;
  annotations?: ContentAnnotations;
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
  annotations?: ContentAnnotations;
}

/**
 * Embedded resource content for tool results per MCP 2025-06-18 specification.
 *
 * @see https://modelcontextprotocol.io/specification/2025-06-18/server/tools#embedded-resources
 */
export interface EmbeddedResource {
  type: 'resource';
  resource: {
    uri: string;
    mimeType?: string;
    text?: string;
    blob?: string;
    annotations?: ContentAnnotations;
  };
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
 * Union type for all possible content types in tool results
 */
export type ToolContentItem =
  | TextContent
  | ImageContent
  | AudioContent
  | ResourceLink
  | EmbeddedResource;

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
 * Zod schema for image content validation
 */
export const ImageContentSchema = z.object({
  type: z.literal('image'),
  data: z.string(),
  mimeType: z.string(),
  annotations: ContentAnnotationsSchema.optional(),
});

/**
 * Zod schema for audio content validation
 */
export const AudioContentSchema = z.object({
  type: z.literal('audio'),
  data: z.string(),
  mimeType: z.string(),
  annotations: ContentAnnotationsSchema.optional(),
});

/**
 * Zod schema for embedded resource validation
 */
export const EmbeddedResourceSchema = z.object({
  type: z.literal('resource'),
  resource: z.object({
    uri: z.string(),
    mimeType: z.string().optional(),
    text: z.string().optional(),
    blob: z.string().optional(),
    annotations: ContentAnnotationsSchema.optional(),
  }),
});

/**
 * Zod schema for resource link validation
 */
export const ResourceLinkSchema = z.object({
  type: z.literal('resource_link'),
  uri: z.string(),
  name: z.string().optional(),
  description: z.string().optional(),
  mimeType: z.string().optional(),
  annotations: ContentAnnotationsSchema.optional(),
});

/**
 * Tool result schema with structured output support per MCP 2025-06-18 specification.
 * Supports text, image, audio content types, resource links, and embedded resources.
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
  resourceLinks: z.array(ResourceLinkSchema).optional(),
  /** Optional image content items (MCP 2025-06-18) */
  imageContent: z.array(ImageContentSchema).optional(),
  /** Optional audio content items (MCP 2025-06-18) */
  audioContent: z.array(AudioContentSchema).optional(),
  /** Optional embedded resources (MCP 2025-06-18) */
  embeddedResources: z.array(EmbeddedResourceSchema).optional(),
});

export type ToolResult = z.infer<typeof ToolResultSchema>;

export const ToolInputSchema = ToolSchema.shape.inputSchema;

/**
 * Tool annotations for trust/safety metadata per MCP 2025-06-18 specification.
 * These annotations describe tool behavior and help clients make trust decisions.
 *
 * @see https://modelcontextprotocol.io/specification/2025-06-18/server/tools#tool
 */
export interface ToolAnnotations {
  /** Hints whether tool output is intended for the user, assistant, or both */
  audience?: ('user' | 'assistant')[];
  /** Whether the tool may perform destructive operations */
  destructive?: boolean;
  /** Whether the tool performs operations that are not reversible */
  irreversible?: boolean;
  /** Whether the tool requires user confirmation before execution */
  requiresConfirmation?: boolean;
  /** Whether the tool accesses external resources (network, filesystem, etc.) */
  accessesExternalResources?: boolean;
}

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
  /** Tool annotations for trust/safety metadata (MCP 2025-06-18) */
  annotations?: ToolAnnotations;
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

  /**
   * Sets tool annotations for trust/safety metadata per MCP 2025-06-18 specification.
   *
   * @param annotations - Tool annotations describing behavior and trust properties
   * @returns this for method chaining
   * @see https://modelcontextprotocol.io/specification/2025-06-18/server/tools#tool
   */
  public annotations(annotations: ToolAnnotations): this {
    this.toolDefinition.annotations = annotations;
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
  mimeType?: string,
  annotations?: ContentAnnotations
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

  if (annotations !== undefined) {
    result.annotations = annotations;
  }

  return result;
}

/**
 * Utility function to create text content per MCP 2025-06-18 specification.
 *
 * @param text - The text content
 * @param annotations - Optional content annotations
 * @returns TextContent object
 */
export function createTextContent(
  text: string,
  annotations?: ContentAnnotations
): TextContent {
  const result: TextContent = {
    type: 'text',
    text,
  };

  if (annotations !== undefined) {
    result.annotations = annotations;
  }

  return result;
}

/**
 * Utility function to create image content per MCP 2025-06-18 specification.
 *
 * @param data - Base64-encoded image data
 * @param mimeType - MIME type of the image (e.g., 'image/png', 'image/jpeg')
 * @param annotations - Optional content annotations
 * @returns ImageContent object
 *
 * @example
 * ```typescript
 * const imageContent = createImageContent(
 *   base64EncodedData,
 *   'image/png',
 *   { audience: ['user'], priority: 0.9 }
 * );
 * ```
 */
export function createImageContent(
  data: string,
  mimeType: string,
  annotations?: ContentAnnotations
): ImageContent {
  const result: ImageContent = {
    type: 'image',
    data,
    mimeType,
  };

  if (annotations !== undefined) {
    result.annotations = annotations;
  }

  return result;
}

/**
 * Utility function to create audio content per MCP 2025-06-18 specification.
 *
 * @param data - Base64-encoded audio data
 * @param mimeType - MIME type of the audio (e.g., 'audio/wav', 'audio/mp3', 'audio/mpeg')
 * @param annotations - Optional content annotations
 * @returns AudioContent object
 *
 * @example
 * ```typescript
 * const audioContent = createAudioContent(
 *   base64EncodedAudioData,
 *   'audio/wav',
 *   { audience: ['user'], priority: 0.8 }
 * );
 * ```
 */
export function createAudioContent(
  data: string,
  mimeType: string,
  annotations?: ContentAnnotations
): AudioContent {
  const result: AudioContent = {
    type: 'audio',
    data,
    mimeType,
  };

  if (annotations !== undefined) {
    result.annotations = annotations;
  }

  return result;
}

/**
 * Utility function to create embedded resource content per MCP 2025-06-18 specification.
 *
 * @param uri - Resource URI
 * @param content - Either text content or base64-encoded blob
 * @param mimeType - Optional MIME type
 * @param annotations - Optional content annotations
 * @returns EmbeddedResource object
 */
export function createEmbeddedResource(
  uri: string,
  content: { text: string } | { blob: string },
  mimeType?: string,
  annotations?: ContentAnnotations
): EmbeddedResource {
  const resource: EmbeddedResource['resource'] = {
    uri,
    ...content,
  };

  if (mimeType !== undefined) {
    resource.mimeType = mimeType;
  }

  if (annotations !== undefined) {
    resource.annotations = annotations;
  }

  return {
    type: 'resource',
    resource,
  };
}
