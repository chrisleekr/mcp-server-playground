import pino from 'pino';

const pinoLogger = pino(
  {
    level: process.env['MCP_LOG_LEVEL'] ?? 'debug',
  },
  pino.destination(process.stdout)
);

export interface LoggerInterface {
  getLogger(): pino.Logger;
  cast(logger: pino.Logger): Logger;
}

export type LogLevel = pino.Level;

class Logger implements LoggerInterface {
  private logger: pino.Logger;

  constructor(logger?: pino.Logger) {
    this.logger = logger ?? pinoLogger;
  }

  getLogger(): pino.Logger {
    return this.logger;
  }

  cast(logger: pino.Logger): Logger {
    return new Logger(logger);
  }
}

export const logger = new Logger();
