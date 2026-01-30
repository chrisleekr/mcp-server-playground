import { type Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  type ReadResourceResult,
  ResourceSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { type ProgressToken } from '@/core/server';

/**
 * Resource execution context for dependency injection and configuration
 */
export interface ResourceContext {
  server?: Server;
  progressToken: ProgressToken;
}

/**
 * Resource annotations per MCP 2025-06-18 specification.
 * Provides metadata about audience, priority, and modification times.
 *
 * @see https://modelcontextprotocol.io/specification/2025-06-18/server/resources#annotations
 */
export interface ResourceAnnotations {
  /** Hints whether content is for the user, assistant, or both */
  audience?: ('user' | 'assistant')[];
  /** Relative importance (0.0 to 1.0). 1 = most important, 0 = least important */
  priority?: number;
  /** ISO 8601 timestamp when the resource was last modified */
  lastModified?: string;
}

/**
 * Resource content types per MCP 2025-06-18 specification.
 */
export interface TextResourceContent {
  uri: string;
  mimeType?: string;
  text: string;
}

export interface BinaryResourceContent {
  uri: string;
  mimeType?: string;
  blob: string;
}

export type ResourceContent = TextResourceContent | BinaryResourceContent;

/**
 * Resource definition interface per MCP 2025-06-18 specification.
 *
 * @see https://modelcontextprotocol.io/specification/2025-06-18/server/resources
 */
export interface ResourceDefinition {
  /** Unique identifier (URI) for the resource */
  uri: string;
  /** The name of the resource */
  name: string;
  /** Optional human-readable title for display purposes */
  title?: string;
  /** Optional description of the resource */
  description?: string;
  /** Optional MIME type of the resource */
  mimeType?: string;
  /** Optional size in bytes */
  size?: number;
  /** Optional annotations for the resource */
  annotations?: ResourceAnnotations;
}

/**
 * Resource read function type
 */
export type ResourceReadFunction = (
  uri: string,
  context: ResourceContext
) => Promise<ReadResourceResult>;

/**
 * Complete resource interface combining definition and implementation
 */
export interface Resource {
  definition: ResourceDefinition;
  read: ResourceReadFunction;
}

/**
 * Resource builder utility for creating resources with validation
 *
 * @example
 * ```typescript
 * const myResource = new ResourceBuilder('file:///example.txt')
 *   .name('Example File')
 *   .description('An example text file')
 *   .mimeType('text/plain')
 *   .annotations({ audience: ['user'], priority: 0.8 })
 *   .readImplementation(async (uri, context) => ({
 *     contents: [{ uri, mimeType: 'text/plain', text: 'Hello World' }]
 *   }))
 *   .build();
 * ```
 */
export class ResourceBuilder {
  private resourceDefinition: Partial<ResourceDefinition> = {};
  private resourceFunction?: ResourceReadFunction;

  constructor(uri: string) {
    this.resourceDefinition.uri = uri;
  }

  public name(name: string): this {
    this.resourceDefinition.name = name;
    return this;
  }

  public title(title: string): this {
    this.resourceDefinition.title = title;
    return this;
  }

  public description(desc: string): this {
    this.resourceDefinition.description = desc;
    return this;
  }

  public mimeType(mimeType: string): this {
    this.resourceDefinition.mimeType = mimeType;
    return this;
  }

  public size(size: number): this {
    this.resourceDefinition.size = size;
    return this;
  }

  public annotations(annotations: ResourceAnnotations): this {
    this.resourceDefinition.annotations = annotations;
    return this;
  }

  public readImplementation(fn: ResourceReadFunction): this {
    this.resourceFunction = fn;
    return this;
  }

  public build(): Resource {
    if (
      this.resourceDefinition.uri === undefined ||
      this.resourceDefinition.name === undefined ||
      this.resourceFunction === undefined
    ) {
      throw new Error(
        'Resource uri, name, and read implementation are required'
      );
    }

    return {
      definition: this.resourceDefinition as ResourceDefinition,
      read: this.resourceFunction,
    };
  }
}

/**
 * Resource template definition for parameterized resources
 *
 * @see https://modelcontextprotocol.io/specification/2025-06-18/server/resources#resource-templates
 */
export interface ResourceTemplateDefinition {
  /** URI template following RFC 6570 */
  uriTemplate: string;
  /** The name of the resource template */
  name: string;
  /** Optional human-readable title */
  title?: string;
  /** Optional description */
  description?: string;
  /** Optional MIME type */
  mimeType?: string;
  /** Optional annotations */
  annotations?: ResourceAnnotations;
}

/**
 * Resource template read function type
 */
export type ResourceTemplateReadFunction = (
  uri: string,
  context: ResourceContext
) => Promise<ReadResourceResult>;

/**
 * Complete resource template interface
 */
export interface ResourceTemplate {
  definition: ResourceTemplateDefinition;
  read: ResourceTemplateReadFunction;
}

/**
 * Resource template builder
 */
export class ResourceTemplateBuilder {
  private templateDefinition: Partial<ResourceTemplateDefinition> = {};
  private templateFunction?: ResourceTemplateReadFunction;

  constructor(uriTemplate: string) {
    this.templateDefinition.uriTemplate = uriTemplate;
  }

  public name(name: string): this {
    this.templateDefinition.name = name;
    return this;
  }

  public title(title: string): this {
    this.templateDefinition.title = title;
    return this;
  }

  public description(desc: string): this {
    this.templateDefinition.description = desc;
    return this;
  }

  public mimeType(mimeType: string): this {
    this.templateDefinition.mimeType = mimeType;
    return this;
  }

  public annotations(annotations: ResourceAnnotations): this {
    this.templateDefinition.annotations = annotations;
    return this;
  }

  public readImplementation(fn: ResourceTemplateReadFunction): this {
    this.templateFunction = fn;
    return this;
  }

  public build(): ResourceTemplate {
    if (
      this.templateDefinition.uriTemplate === undefined ||
      this.templateDefinition.name === undefined ||
      this.templateFunction === undefined
    ) {
      throw new Error(
        'Resource template uriTemplate, name, and read implementation are required'
      );
    }

    return {
      definition: this.templateDefinition as ResourceTemplateDefinition,
      read: this.templateFunction,
    };
  }
}

// Re-export ResourceSchema for convenience
export { ResourceSchema };
