#!/usr/bin/env bun

import 'dotenv/config';

import { config } from '@/config/manager';
import { MCPServer } from '@/core/mcpServer';
import { loggingContext } from '@/core/server';

function main(): void {
  try {
    const server = new MCPServer();
    server.start();

    loggingContext.log(
      'info',
      `Server started successfully on HTTP transport, version: ${config.server.version}`
    );
  } catch (error) {
    loggingContext.log(
      'error',
      `Failed to start server: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
    process.exit(1);
  }
}

main();

process.on('unhandledRejection', (error: unknown) => {
  loggingContext.log(
    'error',
    `Unhandled error: ${error instanceof Error ? error.message : 'Unknown error'}`
  );
  process.exit(1);
});
