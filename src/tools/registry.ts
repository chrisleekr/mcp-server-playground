import { Tool, ToolDefinition } from '@/tools/types';

/**
 * Simple tool registry implementation
 */
export class ToolRegistry {
  private tools = new Map<string, Tool>();

  public register<TInput, TOutput>(tool: Tool<TInput, TOutput>): void {
    this.tools.set(tool.definition.name, tool as Tool);
  }

  public unregister(name: string): void {
    this.tools.delete(name);
  }

  public get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  public list(): ToolDefinition[] {
    return Array.from(this.tools.values()).map(tool => tool.definition);
  }

  public has(name: string): boolean {
    return this.tools.has(name);
  }

  public getAll(): Map<string, Tool> {
    return new Map(this.tools);
  }
}

export const toolRegistry = new ToolRegistry();
