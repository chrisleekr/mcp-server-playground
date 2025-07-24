import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import express from 'express';

import { config } from '@/config/manager';
import { setupErrorHandling } from '@/core/server/errorHandling';
import { setupHttpServer } from '@/core/server/http';
import { loadTools, setupToolHandlers } from '@/core/server/tools';
import { ToolContext } from '@/tools/types';

import { loggingContext } from './server/http/context';

export class MCPServer {
  private server: Server;
  private toolContext: ToolContext;
  private httpServer: express.Application | null = null;

  constructor() {
    this.server = new Server(
      {
        name: 'mcp-server',
        version: config.server.version,
      },
      {
        capabilities: {
          logging: {
            level: 'debug',
          },
          tools: {},
          notifications: {},
          // Note: Saw somewhere, but it seems not working. Just leave it here for now.
          experimental: {
            streaming: true,
            progressNotifications: true,
          },
        },
      }
    );

    this.toolContext = {
      config: {},
      server: this.server,
      progressToken: '', // Placeholder for progress token
    };

    setupToolHandlers(this.toolContext);
    setupErrorHandling(this.server);
    loadTools();
  }

  public start(): void {
    try {
      this.httpServer = setupHttpServer(this.server);

      const port = config.server.http.port;
      const host = config.server.http.host;

      const app = this.httpServer.listen(port, host, () => {
        loggingContext.log('info', 'MCP Server started successfully', {
          data: { host, port },
        });
      });

      // Set keepAliveTimeout and headersTimeout for the http server
      app.keepAliveTimeout = 60000;
      app.headersTimeout = 65000;
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

  public stop(): void {
    if (this.httpServer) {
      // Close HTTP server if it exists
      loggingContext.log('info', 'Stopping MCP Server...');
    }
  }

  // Getter for server instance (for tools that need direct access)
  public getServerInstance(): Server {
    return this.server;
  }
}
