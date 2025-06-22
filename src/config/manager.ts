import { AppConfig } from '@/config/type';
import { loggingContext } from '@/core/server/http/context';

import packageJson from '../../package.json';

/**
 * Configuration Manager
 */
export class ConfigManager {
  private static instance: ConfigManager | undefined;
  private config: AppConfig;

  private constructor() {
    this.config = {
      server: {
        environment: 'dev',
        name: 'mcp-server-boilerplate',
        version: packageJson.version,
        description: 'MCP Server Boilerplate',
        http: {
          port: 3000,
          host: 'localhost',
        },
        auth: {
          enabled: false,
          issuer: 'http://localhost:3000',
          baseUrl: 'http://localhost:3000',
          jwtSecret: 'your-jwt-secret',
          sessionTTL: 3600, // 1 hour
          tokenTTL: 86400, // 1 day
          refreshTokenTTL: 604800, // 1 week
          provider: 'auth0',
          auth0: {
            domain: 'https://dev-1234567890.auth0.com',
            clientId: '1234567890',
            clientSecret: '1234567890',
            audience: 'urn:mcp-server-boilerplate',
            scope: 'openid profile email',
          },
        },
      },
      storage: {
        type: 'memory',
        valkey: {
          url: 'redis://localhost:6379',
        },
      },
      tools: {
        project: {
          path: '/tmp',
        },
      },
    };
  }

  public static getInstance(): ConfigManager {
    ConfigManager.instance ??= new ConfigManager();
    return ConfigManager.instance;
  }

  public loadConfig(): void {
    this.loadFromEnvironment();
  }

  /**
   * Load configuration from environment variables
   * - All config can be overridden by environment variables
   * - Each environment variable will be prefixed with MCP_
   * - Each config path will be determined by the object path i.e.
   *    config.server.host = MCP_CONFIG_SERVER_HOST
   *    config.server.logging.level = MCP_CONFIG_SERVER_LOGGING_LEVEL
   *    config.server.auth.auth0.domain = MCP_CONFIG_SERVER_AUTH_AUTH0_DOMAIN
   *    config.server.auth.sessionTTL = MCP_CONFIG_SERVER_AUTH_SESSION_TTL
   */
  private loadFromEnvironment(): void {
    try {
      // Flatten the config object paths
      const configPaths = this.flattenObjectPaths(
        this.config as unknown as Record<string, unknown>
      );

      // Loop each config path and check if the environment variable exists
      for (const path of configPaths) {
        const envVarName = `MCP_CONFIG_${path
          .replace(/([a-z])([A-Z])/g, '$1_$2')
          .toUpperCase()
          .replace(/\./g, '_')}`;
        const envValue = process.env[envVarName];

        // If found environment variable, update the config value
        if (envValue !== undefined) {
          this.setConfigValue(path, envValue);
        }
      }
    } catch (error: unknown) {
      loggingContext.log('error', 'Failed to load environment configuration:', {
        error: {
          message: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : undefined,
        },
      });
    }
  }

  private setConfigValue(path: string, value: unknown): void {
    const keys = path.split('.');
    // Pop the last key of the path
    const lastKey = keys.pop();

    if (lastKey === undefined) {
      throw new Error('Invalid config path');
    }

    let current = this.config as unknown as Record<string, unknown>;
    for (const key of keys) {
      if ((current as unknown as Record<string, unknown>)[key] === undefined) {
        (current as unknown as Record<string, unknown>)[key] = {};
      }
      current = (current as unknown as Record<string, unknown>)[key] as Record<
        string,
        unknown
      >;
    }

    // Update the final property
    current[lastKey] = this.convertEnvironmentValue(value as string);
    loggingContext.log('debug', 'Config value updated', {
      data: { path, value },
    });
  }

  private flattenObjectPaths(obj: Record<string, unknown>): string[] {
    return Object.keys(obj).flatMap(key => {
      const value = obj[key];
      if (typeof value === 'object' && value !== null) {
        return this.flattenObjectPaths(value as Record<string, unknown>).map(
          subPath => `${key}.${subPath}`
        );
      }
      return [key];
    });
  }

  /**
   * Convert environment variable string to appropriate type
   */
  private convertEnvironmentValue(value: string): unknown {
    // Boolean values
    if (value.toLowerCase() === 'true') return true;
    if (value.toLowerCase() === 'false') return false;

    // Numeric values
    if (!isNaN(Number(value)) && value.trim() !== '') {
      return Number(value);
    }

    // JSON arrays/objects
    if (
      (value.startsWith('[') && value.endsWith(']')) ||
      (value.startsWith('{') && value.endsWith('}'))
    ) {
      try {
        return JSON.parse(value);
      } catch {
        // If JSON parsing fails, return as string
        return value;
      }
    }

    // Otherwise, string
    return value;
  }

  /**
   * Get the current configuration
   */
  public getConfig(): AppConfig {
    return this.config;
  }
}

export const configManager = ConfigManager.getInstance();
configManager.loadConfig();
export const config = configManager.getConfig();
