import { AsyncLocalStorage } from 'async_hooks';

import { logger, type LoggerInterface, type LogLevel } from '@/utils/logger';

function logWithLevel(
  loggerInstance: ReturnType<LoggerInterface['getLogger']>,
  level: LogLevel,
  data: Record<string, unknown>,
  message: string
): void {
  switch (level) {
    case 'trace':
      loggerInstance.trace(data, message);
      break;
    case 'debug':
      loggerInstance.debug(data, message);
      break;
    case 'info':
      loggerInstance.info(data, message);
      break;
    case 'warn':
      loggerInstance.warn(data, message);
      break;
    case 'error':
      loggerInstance.error(data, message);
      break;
    case 'fatal':
      loggerInstance.fatal(data, message);
      break;
  }
}

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
      const loggerInstance = logger.getLogger();

      if (!context) {
        logWithLevel(loggerInstance, level, { ...data }, message);
        return;
      }

      const timestamp = Date.now();
      const requestElapsedTime =
        context.requestStartTime > 0
          ? timestamp - context.requestStartTime
          : undefined;

      logWithLevel(
        loggerInstance,
        level,
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
      const updatedContext = Object.assign({}, context, { [key]: value });
      asyncLocalStorage.enterWith(
        updatedContext as AsyncLocalStorageLoggingContext
      );
    },

    getContextValue: <T>(key: string): T | undefined => {
      const context = asyncLocalStorage.getStore();
      if (!context) {
        return undefined;
      }
      if (!Object.prototype.hasOwnProperty.call(context, key)) {
        return undefined;
      }
      return Reflect.get(context, key) as T | undefined;
    },
  };
};

export const loggingContext = LoggingContext(logger);
