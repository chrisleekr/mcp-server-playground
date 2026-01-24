import { type Server } from '@modelcontextprotocol/sdk/server/index.js';

import { loggingContext, type ProgressToken } from '@/core/server';

export interface ProgressNotificationParams {
  progressToken: ProgressToken;
  progress: number;
  total: number;
  message: string;
}

/**
 * Send a progress notification to the server
 *
 * BUT it seems not working as expected. Just leave it here for now.
 * @param server - The server instance
 * @param params - The progress notification parameters
 */
export async function sendProgressNotification(
  server: Server,
  params: ProgressNotificationParams
): Promise<void> {
  try {
    loggingContext.log('info', 'Sending progress notification', {
      data: { params },
    });
    await server.notification({
      method: 'notifications/progress',
      params: {
        message: params.message,
        progress: params.progress,
        progressToken: params.progressToken,
        total: params.total,
      },
    });
    loggingContext.log('info', 'Progress notification sent', {
      data: { params },
    });
  } catch (error: unknown) {
    loggingContext.log('warn', 'Failed to send progress notification', {
      data: {
        error: {
          message: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : undefined,
        },
      },
    });
  }
}
