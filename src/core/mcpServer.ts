import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import type express from 'express';
import type http from 'http';

import { config } from '@/config/manager';
import { setupErrorHandling } from '@/core/server/errorHandling';
import { setupHttpServer } from '@/core/server/http';
import { loggingContext } from '@/core/server/http/context';
import { loadPrompts, setupPromptsHandlers } from '@/core/server/prompts';
import { loadTools, setupToolHandlers } from '@/core/server/tools';
import { type PromptContext } from '@/prompts/types';
import { type ToolContext } from '@/tools/types';

/**
 * Main MCP Server class that orchestrates HTTP transport, tool/prompt registration,
 * and session management.
 *
 * This class initializes the MCP SDK server with configured capabilities,
 * sets up tool and prompt handlers, and manages the HTTP server lifecycle.
 *
 * @example
 * ```typescript
 * const server = new MCPServer();
 * server.start();
 *
 * // Graceful shutdown
 * process.on('SIGTERM', () => server.stop());
 * ```
 */
export class MCPServer {
  private server: Server;
  private promptContext: PromptContext;
  private toolContext: ToolContext;
  private httpServer: express.Application | null = null;
  private nodeServer: http.Server | null = null;

  constructor() {
    this.server = new Server(
      {
        name: 'mcp-server',
        version: config.server.version,
      },
      {
        capabilities: {
          prompts: {
            listChanged: true,
          },
          logging: {
            level: 'debug',
          },
          tools: {},
        },
      }
    );

    this.promptContext = {
      server: this.server,
      progressToken: '', // Placeholder for progress token
    };
    setupPromptsHandlers(this.promptContext);
    loadPrompts();

    this.toolContext = {
      config: {},
      server: this.server,
      progressToken: '', // Placeholder for progress token
    };
    setupToolHandlers(this.toolContext);
    loadTools();

    setupErrorHandling(this.server);
  }

  /**
   * Starts the HTTP server and begins accepting MCP connections.
   *
   * Configures the Express server with all middleware, routes, and transport handlers.
   * Sets appropriate timeouts for long-running streaming connections.
   *
   * @throws {Error} If the server fails to start synchronously (e.g., invalid configuration)
   * @remarks Asynchronous startup errors (e.g., port in use) terminate the process with exit code 1
   */
  public start(): void {
    try {
      this.httpServer = setupHttpServer(this.server);

      const port = config.server.http.port;
      const host = config.server.http.host;

      this.nodeServer = this.httpServer.listen(port, host, () => {
        loggingContext.log('info', 'MCP Server started successfully', {
          data: { host, port },
        });
      });

      this.nodeServer.on('error', error => {
        loggingContext.log('error', 'Failed to start MCP Server', {
          data: { host, port },
          error: {
            message: error instanceof Error ? error.message : 'Unknown error',
            stack: error instanceof Error ? error.stack : undefined,
          },
        });
        process.exit(1);
      });

      // Set keepAliveTimeout and headersTimeout for the http server
      this.nodeServer.keepAliveTimeout = 60000;
      this.nodeServer.headersTimeout = 65000;
    } catch (error) {
      loggingContext.log('error', 'Failed to start MCP Server', {
        error: {
          message: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : undefined,
        },
      });
      throw error;
    }
  }

  /**
   * Gracefully stops the HTTP server.
   *
   * Closes all active connections and releases the port.
   * Safe to call multiple times; subsequent calls are no-ops.
   */
  public stop(): void {
    loggingContext.log('info', 'Stopping MCP Server...');
    if (this.nodeServer !== null) {
      const server = this.nodeServer;
      server.close(() => {
        loggingContext.log('info', 'MCP Server stopped');
        this.nodeServer = null;
      });
    }
  }

  /**
   * Returns the underlying MCP SDK Server instance.
   *
   * Useful for tools that need direct access to send notifications
   * or access server capabilities.
   *
   * @returns The MCP SDK Server instance
   */
  public getServerInstance(): Server {
    return this.server;
  }
}
