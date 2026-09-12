import pino, { type Logger, type LoggerOptions } from 'pino';

import type { AppConfig } from '../../config/env.js';
import { getRequestContext } from './request-context.js';

export function createLogger(config: AppConfig): Logger {
  const options: LoggerOptions = {
    level: config.LOG_LEVEL,
    base: {
      service: config.OTEL_SERVICE_NAME,
      version: config.MOSAIC_SERVER_VERSION,
    },
    mixin() {
      const ctx = getRequestContext();
      return ctx ? { requestId: ctx.requestId, traceId: ctx.traceId } : {};
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: {
      paths: [
        'req.headers.cookie',
        'req.headers.authorization',
        'req.headers["x-affine-csrf-token"]',
        'password',
        '*.password',
      ],
      censor: '[redacted]',
    },
  };

  if (config.NODE_ENV === 'development' && config.LOG_LEVEL !== 'silent') {
    return pino({
      ...options,
      transport: {
        target: 'pino-pretty',
        options: { colorize: true, translateTime: 'SYS:standard' },
      },
    });
  }

  return pino(options);
}
