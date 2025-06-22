import { ToolSchema } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

/**
 * Tool execution context for dependency injection and configuration
 */
export interface ToolContext {
  config: Record<string, unknown>;
}

/**
 * Tool result schema
 */
export const ToolResultSchema = z.object({
  success: z.boolean(),
  data: z.unknown().optional(),
  error: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
  executionTime: z.number().optional(),
  timestamp: z.string().optional(),
});

export type ToolResult = z.infer<typeof ToolResultSchema>;

export const ToolInputSchema = ToolSchema.shape.inputSchema;

/**
 * Tool definition interface
 */
export interface ToolDefinition {
  name: string;
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
}

/**
 * Tool execution function interface
 */
export type ToolFunction<
  TInput = Record<string, unknown>,
  TOutput = unknown,
> = (
  input: TInput,
  context: ToolContext
) => Promise<ToolResult & { data?: TOutput }>;

/**
 * Complete tool interface combining definition and implementation
 */
export interface Tool<TInput = Record<string, unknown>, TOutput = unknown> {
  definition: ToolDefinition;
  execute: ToolFunction<TInput, TOutput>;
}

/**
 * Tool builder utility for creating tools with validation
 */
export class ToolBuilder<TInput = Record<string, unknown>, TOutput = unknown> {
  private toolDefinition: Partial<ToolDefinition> = {};
  private toolFunction?: ToolFunction<TInput, TOutput>;

  constructor(name: string) {
    this.toolDefinition.name = name;
  }

  public description(desc: string): this {
    this.toolDefinition.description = desc;
    return this;
  }

  public inputSchema(schema: typeof ToolInputSchema): this {
    this.toolDefinition.inputSchema = schema;
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

  public implementation(fn: ToolFunction<TInput, TOutput>): this {
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
