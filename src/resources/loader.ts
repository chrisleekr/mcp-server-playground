import { loggingContext } from '@/core/server';
import { resourceRegistry } from '@/resources/registry';
import {
  type Resource,
  type ResourceDefinition,
  type ResourceTemplate,
  type ResourceTemplateDefinition,
} from '@/resources/types';

import { echoResource, echoResourceTemplate } from './echo';

/**
 * Resource loader singleton for managing resource registration.
 */
export class ResourceLoader {
  private static instance: ResourceLoader | undefined;
  private loaded = false;

  public static getInstance(): ResourceLoader {
    ResourceLoader.instance ??= new ResourceLoader();
    return ResourceLoader.instance;
  }

  public loadAllResources(): void {
    if (this.loaded) {
      loggingContext.log('debug', 'Resources already loaded, skipping...');
      return;
    }

    try {
      loggingContext.log('info', 'Loading resources...');

      // Register echo resource
      this.registerResource(echoResource);

      // Register echo resource template
      this.registerTemplate(echoResourceTemplate);

      this.loaded = true;
      loggingContext.log('info', 'Successfully loaded resources');
    } catch (error: unknown) {
      loggingContext.log('error', 'Failed to load resources', {
        error: {
          message: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : undefined,
        },
      });
      throw error;
    }
  }

  private registerResource(resource: Resource): void {
    try {
      loggingContext.log(
        'debug',
        `Registering resource: ${resource.definition.uri}`,
        {
          data: { resource: resource.definition },
        }
      );

      this.validateResource(resource);

      resourceRegistry.register(resource);

      loggingContext.log(
        'debug',
        `Registered resource: ${resource.definition.uri}`,
        {
          data: { resource: resource.definition },
        }
      );
    } catch (error: unknown) {
      loggingContext.log(
        'error',
        `Failed to register resource ${resource.definition.uri}`,
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

  private registerTemplate(template: ResourceTemplate): void {
    try {
      loggingContext.log(
        'debug',
        `Registering resource template: ${template.definition.uriTemplate}`,
        {
          data: { template: template.definition },
        }
      );

      this.validateTemplate(template);

      resourceRegistry.registerTemplate(template);

      loggingContext.log(
        'debug',
        `Registered resource template: ${template.definition.uriTemplate}`,
        {
          data: { template: template.definition },
        }
      );
    } catch (error: unknown) {
      loggingContext.log(
        'error',
        `Failed to register resource template ${template.definition.uriTemplate}`,
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

  private validateResource(resource: Resource): void {
    loggingContext.log(
      'debug',
      `Validating resource: ${resource.definition.uri}`,
      {
        data: { resource: resource.definition },
      }
    );

    if (!resource.definition.uri) {
      loggingContext.log('error', 'Resource URI is required', {
        data: { resource: resource.definition },
      });
      throw new Error('Resource URI is required');
    }

    if (!resource.definition.name) {
      loggingContext.log('error', 'Resource name is required', {
        data: { resource: resource.definition },
      });
      throw new Error(`Resource ${resource.definition.uri} must have a name`);
    }

    if (typeof resource.read !== 'function') {
      loggingContext.log('error', 'Resource must have a read function', {
        data: { resource: resource.definition },
      });
      throw new Error(
        `Resource ${resource.definition.uri} must have a read function`
      );
    }

    if (resourceRegistry.has(resource.definition.uri)) {
      loggingContext.log('error', 'Resource is already registered', {
        data: { resource: resource.definition },
      });
      throw new Error(
        `Resource ${resource.definition.uri} is already registered`
      );
    }
  }

  private validateTemplate(template: ResourceTemplate): void {
    loggingContext.log(
      'debug',
      `Validating resource template: ${template.definition.uriTemplate}`,
      {
        data: { template: template.definition },
      }
    );

    if (!template.definition.uriTemplate) {
      throw new Error('Resource template uriTemplate is required');
    }

    if (!template.definition.name) {
      throw new Error(
        `Resource template ${template.definition.uriTemplate} must have a name`
      );
    }

    if (typeof template.read !== 'function') {
      throw new Error(
        `Resource template ${template.definition.uriTemplate} must have a read function`
      );
    }

    if (
      resourceRegistry.getTemplate(template.definition.uriTemplate) !==
      undefined
    ) {
      loggingContext.log('error', 'Resource template is already registered', {
        data: { template: template.definition },
      });
      throw new Error(
        `Resource template ${template.definition.uriTemplate} is already registered`
      );
    }
  }

  public getResourceDefinitions(): ResourceDefinition[] {
    return resourceRegistry.list();
  }

  public getTemplateDefinitions(): ResourceTemplateDefinition[] {
    return resourceRegistry.listTemplates();
  }

  public getResource(uri: string): Resource | undefined {
    return resourceRegistry.get(uri);
  }

  public findTemplateForUri(
    uri: string
  ):
    | { template: ResourceTemplate; params: Record<string, string> }
    | undefined {
    return resourceRegistry.findTemplateForUri(uri);
  }

  public isLoaded(): boolean {
    return this.loaded;
  }

  public reset(): void {
    this.loaded = false;
    resourceRegistry.clear();
  }
}

export const resourceLoader = ResourceLoader.getInstance();
