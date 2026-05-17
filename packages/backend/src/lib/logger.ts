/**
 * Lightweight structured logger.
 * Drop-in replacement for console.log with levels and timestamps.
 * Can be swapped to pino/winston later without changing call sites.
 */

const LOG_LEVELS = { debug: 0, info: 1, warn: 2, error: 3 } as const;
type LogLevel = keyof typeof LOG_LEVELS;

function parseLogLevel(value: string | undefined): LogLevel {
  if (value && Object.prototype.hasOwnProperty.call(LOG_LEVELS, value)) {
    return value as LogLevel;
  }

  return 'info';
}

const currentLevel = parseLogLevel(process.env.LOG_LEVEL);

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[currentLevel];
}

function timestamp(): string {
  return new Date().toISOString();
}

export const logger = {
  debug: (...args: unknown[]) => {
    if (shouldLog('debug')) console.debug(`[${timestamp()}] [DEBUG]`, ...args);
  },
  info: (...args: unknown[]) => {
    if (shouldLog('info')) console.log(`[${timestamp()}] [INFO]`, ...args);
  },
  warn: (...args: unknown[]) => {
    if (shouldLog('warn')) console.warn(`[${timestamp()}] [WARN]`, ...args);
  },
  error: (...args: unknown[]) => {
    if (shouldLog('error')) console.error(`[${timestamp()}] [ERROR]`, ...args);
  },
};
