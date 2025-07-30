import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { GetPromptResult } from '@modelcontextprotocol/sdk/types.js';

import { ProgressToken } from '@/core/server';

export interface PromptContext {
  server?: Server;
  progressToken: ProgressToken;
}

/**
 * Prompt definition interface
 */

export interface PromptDefinitionArgument {
  name: string;
  description: string;
  required: boolean;
}

export interface PromptDefinition {
  name: string;
  description: string;
  arguments: PromptDefinitionArgument[];
}

/**
 * Prompt result schema
 */
export type PromptResult = GetPromptResult;

/**
 * Prompt process function
 */
export type PromptProcessFunction<TInput = Record<string, unknown>> = (
  input: TInput,
  context: PromptContext
) => AsyncGenerator<GetPromptResult>;

/**
 * Prompt interface
 */
export interface Prompt<TInput = Record<string, unknown>> {
  definition: PromptDefinition;
  process: PromptProcessFunction<TInput>;
}

export class PromptBuilder<TInput = Record<string, unknown>> {
  private promptDefinition: Partial<PromptDefinition> = {};
  private promptFunction?: PromptProcessFunction<TInput>;

  constructor(name: string) {
    this.promptDefinition.name = name;
  }

  public description(desc: string): this {
    this.promptDefinition.description = desc;
    return this;
  }

  public arguments(args: PromptDefinitionArgument[]): this {
    this.promptDefinition.arguments = args;
    return this;
  }

  public processImplementation(fn: PromptProcessFunction<TInput>): this {
    this.promptFunction = fn;
    return this;
  }

  public build(): Prompt<TInput> {
    if (
      this.promptDefinition.name === undefined ||
      this.promptFunction === undefined
    ) {
      throw new Error('Prompt name and implementation are required');
    }

    return {
      definition: this.promptDefinition as PromptDefinition,
      process: this.promptFunction,
    };
  }
}
