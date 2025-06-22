import { Server } from '@modelcontextprotocol/sdk/server/index.js';

import { loggingContext } from './http/context';

export function setupErrorHandling(server: Server): void {
  server.oninitialized = (): void => {
    loggingContext.log('info', 'Server initialized');
  };

  server.onclose = (): void => {
    loggingContext.log('info', 'Server closed');
  };

  server.onerror = (error): void => {
    loggingContext.log('error', 'Server error', {
      data: {
        error: {
          message: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : undefined,
        },
      },
    });
  };

  process.on('SIGINT', (): void => {
    loggingContext.log('info', 'Received SIGINT, shutting down gracefully...');
    server.close().catch((error: unknown) => {
      loggingContext.log('error', 'Error closing server', {
        data: {
          error: {
            message: error instanceof Error ? error.message : 'Unknown error',
            stack: error instanceof Error ? error.stack : undefined,
          },
        },
      });
    });
    process.exit(0);
  });

  process.on('SIGTERM', (): void => {
    loggingContext.log('info', 'Received SIGTERM, shutting down gracefully...');
    server.close().catch((error: unknown) => {
      loggingContext.log('error', 'Error closing server', {
        data: {
          error: {
            message: error instanceof Error ? error.message : 'Unknown error',
          },
        },
      });
    });
    process.exit(0);
  });
}
