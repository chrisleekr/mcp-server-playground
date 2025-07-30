import { loggingContext } from '@/core/server';
import { promptRegistry } from '@/prompts/registry';
import { Prompt, PromptDefinition } from '@/prompts/types';

import { echoPrompt } from './echo';

export class PromptLoader {
  private static instance: PromptLoader | undefined;
  private loaded = false;

  public static getInstance(): PromptLoader {
    PromptLoader.instance ??= new PromptLoader();
    return PromptLoader.instance;
  }

  public loadAllPrompts(): void {
    if (this.loaded) {
      loggingContext.log('debug', 'Prompts already loaded, skipping...');
      return;
    }

    try {
      loggingContext.log('info', 'Loading prompts...');

      // Register echo prompt
      this.registerPrompt(echoPrompt);

      this.loaded = true;
      loggingContext.log('info', 'Successfully loaded prompts');
    } catch (error: unknown) {
      loggingContext.log('error', 'Failed to load prompts', {
        error: {
          message: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : undefined,
        },
      });
    }
  }

  private registerPrompt<TInput>(prompt: Prompt<TInput>): void {
    try {
      loggingContext.log(
        'debug',
        `Registering prompt: ${prompt.definition.name}`,
        {
          data: { prompt: prompt.definition },
        }
      );

      this.validatePrompt(prompt);

      promptRegistry.register(prompt);

      loggingContext.log(
        'debug',
        `Registered prompt: ${prompt.definition.name}`,
        {
          data: { prompt: prompt.definition },
        }
      );
    } catch (error: unknown) {
      loggingContext.log(
        'error',
        `Failed to register prompt ${prompt.definition.name}`,
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

  private validatePrompt<TInput>(prompt: Prompt<TInput>): void {
    loggingContext.log(
      'debug',
      `Validating prompt: ${prompt.definition.name}`,
      {
        data: { prompt: prompt.definition },
      }
    );

    if (!prompt.definition.name) {
      loggingContext.log('error', 'Prompt name is required', {
        data: { prompt: prompt.definition },
      });
      throw new Error('Prompt name is required');
    }

    if (!prompt.definition.description) {
      loggingContext.log('error', 'Prompt description is required', {
        data: { prompt: prompt.definition },
      });
      throw new Error(
        `Prompt ${prompt.definition.name} must have a description`
      );
    }

    if (typeof prompt.process !== 'function') {
      loggingContext.log('error', 'Prompt must have a process function', {
        data: { prompt: prompt.definition },
      });
      throw new Error(
        `Prompt ${prompt.definition.name} must have a process function`
      );
    }

    if (promptRegistry.has(prompt.definition.name)) {
      loggingContext.log('error', 'Prompt is already registered', {
        data: { prompt: prompt.definition },
      });
      throw new Error(`Prompt ${prompt.definition.name} is already registered`);
    }
  }

  public getPromptDefinitions(): PromptDefinition[] {
    return promptRegistry.list();
  }

  public getPrompt(name: string): Prompt | undefined {
    return promptRegistry.get(name);
  }

  public isLoaded(): boolean {
    return this.loaded;
  }

  public reset(): void {
    this.loaded = false;
  }
}

// Export singleton instance
export const promptLoader = PromptLoader.getInstance();
