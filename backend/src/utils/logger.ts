type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface Logger {
  debug: (...args: any[]) => void;
  info: (...args: any[]) => void;
  warn: (...args: any[]) => void;
  error: (...args: any[]) => void;
}

const logLevels: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const currentLevel: LogLevel = (process.env.LOG_LEVEL as LogLevel) || 'info';
const currentLevelValue = logLevels[currentLevel];

function shouldLog(level: LogLevel): boolean {
  return logLevels[level] >= currentLevelValue;
}

function formatMessage(level: LogLevel, ...args: any[]): string {
  const timestamp = new Date().toISOString();
  const levelUpper = level.toUpperCase().padEnd(5);
  return `[${timestamp}] ${levelUpper} ${args.join(' ')}`;
}

export const logger: Logger = {
  debug: (...args: any[]) => {
    if (shouldLog('debug')) {
      console.log(formatMessage('debug', ...args));
    }
  },
  info: (...args: any[]) => {
    if (shouldLog('info')) {
      console.log(formatMessage('info', ...args));
    }
  },
  warn: (...args: any[]) => {
    if (shouldLog('warn')) {
      console.warn(formatMessage('warn', ...args));
    }
  },
  error: (...args: any[]) => {
    if (shouldLog('error')) {
      console.error(formatMessage('error', ...args));
    }
  },
};
