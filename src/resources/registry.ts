import {
  type Resource,
  type ResourceDefinition,
  type ResourceTemplate,
  type ResourceTemplateDefinition,
} from '@/resources/types';

/**
 * Resource registry implementation for managing MCP resources.
 * Provides registration, lookup, and listing capabilities.
 */
export class ResourceRegistry {
  private resources = new Map<string, Resource>();
  private templates = new Map<string, ResourceTemplate>();

  /**
   * Register a resource by its URI
   */
  public register(resource: Resource): void {
    this.resources.set(resource.definition.uri, resource);
  }

  /**
   * Unregister a resource by URI
   */
  public unregister(uri: string): void {
    this.resources.delete(uri);
  }

  /**
   * Get a resource by URI
   */
  public get(uri: string): Resource | undefined {
    return this.resources.get(uri);
  }

  /**
   * List all resource definitions
   */
  public list(): ResourceDefinition[] {
    return Array.from(this.resources.values()).map(
      resource => resource.definition
    );
  }

  /**
   * Check if a resource exists
   */
  public has(uri: string): boolean {
    return this.resources.has(uri);
  }

  /**
   * Get all resources
   */
  public getAll(): Map<string, Resource> {
    return new Map(this.resources);
  }

  /**
   * Register a resource template
   */
  public registerTemplate(template: ResourceTemplate): void {
    this.templates.set(template.definition.uriTemplate, template);
  }

  /**
   * Unregister a resource template
   */
  public unregisterTemplate(uriTemplate: string): void {
    this.templates.delete(uriTemplate);
  }

  /**
   * Get a resource template by URI template
   */
  public getTemplate(uriTemplate: string): ResourceTemplate | undefined {
    return this.templates.get(uriTemplate);
  }

  /**
   * List all resource template definitions
   */
  public listTemplates(): ResourceTemplateDefinition[] {
    return Array.from(this.templates.values()).map(
      template => template.definition
    );
  }

  /**
   * Find a template that matches a given URI
   * Returns the template and extracted parameters if found
   */
  public findTemplateForUri(
    uri: string
  ):
    | { template: ResourceTemplate; params: Record<string, string> }
    | undefined {
    for (const [uriTemplate, template] of this.templates) {
      const params = this.matchUriTemplate(uriTemplate, uri);
      if (params !== null) {
        return { template, params };
      }
    }
    return undefined;
  }

  /**
   * Simple URI template matching (supports basic {param} syntax only)
   *
   * Limitations per RFC 6570:
   * - Only supports simple path segment replacement ({param})
   * - Does not support RFC 6570 operators (+, #, ., /, ;, ?, &)
   * - Does not handle URI-encoded characters
   * - Does not support query parameters
   *
   * @see https://datatracker.ietf.org/doc/html/rfc6570
   */
  private matchUriTemplate(
    template: string,
    uri: string
  ): Record<string, string> | null {
    const templateParts = template.split('/');
    const uriParts = uri.split('/');

    if (templateParts.length !== uriParts.length) {
      return null;
    }

    const params: Record<string, string> = {};

    for (const [index, templatePart] of templateParts.entries()) {
      const uriPart = uriParts.at(index);

      if (uriPart === undefined) {
        return null;
      }

      const paramMatch = /^\{(\w+)\}$/.exec(templatePart);
      if (paramMatch?.[1] !== undefined) {
        params[paramMatch[1]] = uriPart;
      } else if (templatePart !== uriPart) {
        return null;
      }
    }

    return params;
  }

  /**
   * Clear all resources and templates
   */
  public clear(): void {
    this.resources.clear();
    this.templates.clear();
  }
}

export const resourceRegistry = new ResourceRegistry();
