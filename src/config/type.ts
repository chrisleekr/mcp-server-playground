import { z } from 'zod';

export const StorageValkeyConfigSchema = z.object({
  url: z.string().min(1, 'Valkey URL is required'),
});

export type StorageValkeyConfig = z.infer<typeof StorageValkeyConfigSchema>;

export const StorageConfigSchema = z.object({
  type: z.enum(['memory', 'valkey']).default('memory'),
  valkey: StorageValkeyConfigSchema,
});

export type StorageConfig = z.infer<typeof StorageConfigSchema>;

export const Auth0ConfigSchema = z.object({
  domain: z.string().min(1, 'Auth0 domain is required'),
  clientId: z.string().min(1, 'Auth0 client ID is required'),
  clientSecret: z.string().min(1, 'Auth0 client secret is required'),
  audience: z.string().min(1, 'Auth0 audience is required'),
  scope: z.string().min(1, 'Auth0 scope is required'),
});

export type Auth0Config = z.infer<typeof Auth0ConfigSchema>;

export const AuthConfigSchema = z.object({
  enabled: z.boolean().default(false),
  issuer: z.string().min(1, 'Issuer is required'),
  baseUrl: z.string().min(1, 'Base URL is required'),
  jwtSecret: z.string().min(1, 'JWT secret is required'),
  sessionTTL: z.number().int().min(1),
  tokenTTL: z.number().int().min(1),
  refreshTokenTTL: z.number().int().min(1),
  provider: z.enum(['auth0']).default('auth0'),
  auth0: Auth0ConfigSchema,
});

export type AuthConfig = z.infer<typeof AuthConfigSchema>;

/**
 * Server configuration schema with comprehensive validation
 */
export const ServerConfigSchema = z.object({
  environment: z.enum(['dev', 'prod', 'staging']).default('dev'),
  name: z.string().min(1, 'Server name is required'),
  version: z.string(),
  description: z.string().optional(),
  http: z.object({
    port: z.number().int().min(1).max(65535),
    host: z.string(),
  }),
  auth: AuthConfigSchema,
});

export type ServerConfig = z.infer<typeof ServerConfigSchema>;

export const ToolsConfigSchema = z.object({
  project: z.object({
    path: z.string(),
  }),
});

export type ToolsConfig = z.infer<typeof ToolsConfigSchema>;

/**
 * Complete application configuration combining all config sources
 */
export interface AppConfig {
  server: ServerConfig;
  storage: StorageConfig;
  tools: ToolsConfig;
}
