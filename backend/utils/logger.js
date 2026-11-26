const os = require('node:os');
const path = require('node:path');
const winston = require('winston');
const { redactLogMeta, redactBearerPath } = require('./redactLogMeta');

const redactFormat = winston.format((info) => {
  const { timestamp, level, message, stack, ...meta } = info;
  // The request log line's message is "<METHOD> <path>".
  if (typeof message === 'string') info.message = redactBearerPath(message);
  return Object.assign(info, redactLogMeta(meta));
});

const isProd = process.env.NODE_ENV === 'production';
const logToFile = !isProd && String(process.env.LOG_TO_FILE || '').toLowerCase() === 'true';

const outputFormat = isProd
  ? winston.format.json()
  : winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
      const metaString = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
      const stackString = stack ? `\n${stack}` : '';
      return `${timestamp} [${level}]: ${message}${metaString}${stackString}`;
    });

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    redactFormat(),
    outputFormat,
  ),
  transports: [
    new winston.transports.Console(),
    // Opt-in local file logging only (writes to tmpdir, never into the workspace or /app).
    ...(logToFile ? [
      new winston.transports.File({
        filename: path.join(os.tmpdir(), 'pantopus-combined.log'),
        maxsize: 52428800,  // 50MB per file
        maxFiles: 5,        // keep 5 rotated files
        tailable: true,
      }),
    ] : []),
  ],
});

module.exports = logger;