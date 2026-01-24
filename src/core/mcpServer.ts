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

  // Getter for server instance (for tools that need direct access)
  public getServerInstance(): Server {
    return this.server;
  }
}
