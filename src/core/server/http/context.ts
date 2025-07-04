import { AsyncLocalStorage } from 'async_hooks';

import { logger, LoggerInterface, LogLevel } from '@/utils/logger';

// References:
//  https://nodejs.org/api/async_context.html
//  https://betterstack.com/community/guides/scaling-nodejs/async-hooks-explained/
export interface AsyncLocalStorageLoggingContext {
  readonly requestId: string;
  readonly ipAddress: string;
  readonly mcpSessionId?: string;
  readonly mcpProtocolVersion?: string;
  readonly userAgent?: string;
  readonly requestStartTime: number;
  // Allow additional dynamic properties
  readonly [key: string]: unknown;
}

// Create a new AsyncLocalStorage instance to store the context
const asyncLocalStorage =
  new AsyncLocalStorage<AsyncLocalStorageLoggingContext>();

export interface LoggingContextInterface {
  init: (
    context: AsyncLocalStorageLoggingContext,
    callback: () => void
  ) => void;
  log: (
    level: LogLevel,
    message: string,
    data?: Record<string, unknown>
  ) => void;
  getContext: () => AsyncLocalStorageLoggingContext | undefined;
  setContextValue: (key: string, value: unknown) => void;
  getContextValue: <T>(key: string) => T | undefined;
}

export const LoggingContext = (
  logger: LoggerInterface
): LoggingContextInterface => {
  return {
    init: (
      context: AsyncLocalStorageLoggingContext,
      callback: () => void
    ): void => {
      asyncLocalStorage.run(context, () => {
        callback();
      });
    },
    log: (
      level: LogLevel,
      message: string,
      data?: Record<string, unknown>
    ): void => {
      const context = asyncLocalStorage.getStore();
      if (!context) {
        // If no context, log the message without the context
        logger.getLogger()[level]({ ...data }, message);
        return;
      }

      // If context, log the message with the context
      const timestamp = Date.now();
      const requestElapsedTime =
        context.requestStartTime > 0 && context.requestStartTime > 0
          ? timestamp - context.requestStartTime
          : undefined;

      logger.getLogger()[level](
        {
          ...data,
          ...context,
          timestamp,
          requestElapsedTime,
        },
        message
      );
    },
    getContext: (): AsyncLocalStorageLoggingContext | undefined => {
      return asyncLocalStorage.getStore();
    },
    setContextValue: (key: string, value: unknown): void => {
      const context = asyncLocalStorage.getStore();
      if (!context) {
        return;
      }
      const updatedContext = { ...context, [key]: value };
      asyncLocalStorage.enterWith(updatedContext);
    },

    getContextValue: <T>(key: string): T | undefined => {
      const context = asyncLocalStorage.getStore();
      if (!context) {
        return undefined;
      }
      return context[key] as T | undefined;
    },
  };
};

export const loggingContext = LoggingContext(logger);
