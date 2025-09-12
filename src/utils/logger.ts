import winston from 'winston';

// Create logger instance with default configuration
export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'ada-futures-bot' },
  transports: [
    // Write all logs to console
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    }),
    // Write all logs to file
    new winston.transports.File({ 
      filename: process.env.LOG_FILE || 'logs/trading-bot.log',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
  ],
});

// Create a stream for Morgan HTTP logging
export const logStream = {
  write: (message: string) => {
    logger.info(message.trim());
  }
};
