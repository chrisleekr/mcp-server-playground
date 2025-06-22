import { loggingContext } from '@/core/server/http/context';
import { Tool, ToolDefinition } from '@/tools/types';

import { echoTool } from './echo';
import { projectTool } from './project';
import { toolRegistry } from './registry';
import { systemTimeTool } from './system-time';

export class ToolLoader {
  private static instance: ToolLoader | undefined;
  private loaded = false;

  public static getInstance(): ToolLoader {
    ToolLoader.instance ??= new ToolLoader();
    return ToolLoader.instance;
  }

  public loadAllTools(): void {
    if (this.loaded) {
      loggingContext.log('debug', 'Tools already loaded, skipping...');
      return;
    }

    try {
      loggingContext.log('info', 'Loading tools...');

      // Register core tools
      this.registerTool(systemTimeTool);

      // Register example tools
      this.registerTool(echoTool);

      // Register project tool
      this.registerTool(projectTool);

      this.loaded = true;
      loggingContext.log('info', 'Successfully loaded tools', {
        data: { tools: toolRegistry.list() },
      });
    } catch (error: unknown) {
      loggingContext.log('error', 'Failed to load tools', {
        error: {
          message: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : undefined,
        },
      });
      throw error;
    }
  }

  private registerTool<TInput, TOutput>(tool: Tool<TInput, TOutput>): void {
    try {
      loggingContext.log('debug', `Registering tool: ${tool.definition.name}`, {
        data: { tool: tool.definition },
      });

      this.validateTool(tool);

      toolRegistry.register(tool);

      loggingContext.log('debug', `Registered tool: ${tool.definition.name}`, {
        data: { tool: tool.definition },
      });
    } catch (error: unknown) {
      loggingContext.log(
        'error',
        `Failed to register tool ${tool.definition.name}`,
        {
          error: {
            message: error instanceof Error ? error.message : 'Unknown error',
            stack: error instanceof Error ? error.stack : undefined,
          },
        }
      );
      throw error;
    }
  }

  private validateTool<TInput, TOutput>(tool: Tool<TInput, TOutput>): void {
    loggingContext.log('debug', `Validating tool: ${tool.definition.name}`, {
      data: { tool: tool.definition },
    });

    if (!tool.definition.name) {
      loggingContext.log('error', 'Tool name is required', {
        data: { tool: tool.definition },
      });
      throw new Error('Tool name is required');
    }

    if (!tool.definition.description) {
      loggingContext.log('error', 'Tool description is required', {
        data: { tool: tool.definition },
      });
      throw new Error(`Tool ${tool.definition.name} must have a description`);
    }

    if (typeof tool.execute !== 'function') {
      loggingContext.log('error', 'Tool must have an execute function', {
        data: { tool: tool.definition },
      });
      throw new Error(
        `Tool ${tool.definition.name} must have an execute function`
      );
    }

    if (toolRegistry.has(tool.definition.name)) {
      loggingContext.log('error', 'Tool is already registered', {
        data: { tool: tool.definition },
      });
      throw new Error(`Tool ${tool.definition.name} is already registered`);
    }
  }

  public getToolDefinitions(): ToolDefinition[] {
    return toolRegistry.list();
  }

  public getTool(name: string): Tool | undefined {
    return toolRegistry.get(name);
  }

  public isLoaded(): boolean {
    return this.loaded;
  }

  public reset(): void {
    this.loaded = false;
  }
}

// Export singleton instance
export const toolLoader = ToolLoader.getInstance();
