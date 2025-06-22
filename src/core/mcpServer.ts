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
          logging: {},
          tools: {},
        },
      }
    );

    this.toolContext = {
      config: {},
    };

    setupToolHandlers(this.server, this.toolContext);
    setupErrorHandling(this.server);
    loadTools();
  }

  public start(): void {
    try {
      this.httpServer = setupHttpServer(this.server);

      const port = config.server.http.port;
      const host = config.server.http.host;

      this.httpServer.listen(port, host, () => {
        loggingContext.log('info', 'MCP Server started successfully', {
          data: { host, port },
        });
      });
    } catch (error) {
      loggingContext.log('error', 'Failed to start MCP Server', {
        error: {
          message: error instanceof Error ? error.message : 'Unknown error',
        },
      });
      throw error;
    }
  }
}
