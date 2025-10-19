/**
 * Structured logging utility for CloudWatch Logs
 * Outputs JSON format for easy parsing with CloudWatch Insights
 */

class Logger {
  constructor(context = {}) {
    this.context = context;
  }

  log(level, message, metadata = {}) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...this.context,
      ...metadata
    };

    // Filter out undefined/null values
    Object.keys(logEntry).forEach(key =>
      logEntry[key] === undefined || logEntry[key] === null ? delete logEntry[key] : {}
    );

    console.log(JSON.stringify(logEntry));
  }

  info(message, metadata) {
    this.log('INFO', message, metadata);
  }

  error(message, metadata) {
    this.log('ERROR', message, metadata);
  }

  warn(message, metadata) {
    this.log('WARN', message, metadata);
  }

  debug(message, metadata) {
    if (process.env.LOG_LEVEL === 'DEBUG') {
      this.log('DEBUG', message, metadata);
    }
  }

  addContext(context) {
    this.context = { ...this.context, ...context };
  }
}

// Factory function for creating logger instances
function create(context = {}) {
  return new Logger(context);
}

module.exports = {
  Logger,
  create
};
