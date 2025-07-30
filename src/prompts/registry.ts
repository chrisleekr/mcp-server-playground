import { Prompt, PromptDefinition } from '@/prompts/types';

/**
 * Prompt registry implementation
 */
export class PromptRegistry {
  private prompts = new Map<string, Prompt>();

  public register<TInput>(prompt: Prompt<TInput>): void {
    this.prompts.set(prompt.definition.name, prompt as Prompt);
  }

  public unregister(name: string): void {
    this.prompts.delete(name);
  }

  public get(name: string): Prompt | undefined {
    return this.prompts.get(name);
  }

  public list(): PromptDefinition[] {
    return Array.from(this.prompts.values()).map(prompt => prompt.definition);
  }

  public has(name: string): boolean {
    return this.prompts.has(name);
  }

  public getAll(): Map<string, Prompt> {
    return new Map(this.prompts);
  }
}

export const promptRegistry = new PromptRegistry();
