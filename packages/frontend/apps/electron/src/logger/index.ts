import type { LoggerService as NestLoggerService } from '@nestjs/common';
import { app, shell } from 'electron';
import type { LogFunctions } from 'electron-log';
import log from 'electron-log/main';

import { isDev } from '../shared/constants';

// Initialize electron-log (only once)
log.initialize({ preload: false });

if (isDev) {
  log.transports.file.level = 'debug';
  log.transports.console.level = 'debug';
} else {
  log.transports.file.level = 'info';
  log.transports.console.level = 'info';
}

export function getLogFilePath() {
  return log.transports.file.getFile().path;
}

export async function revealLogFile() {
  const filePath = getLogFilePath();
  return await shell.openPath(filePath);
}

app?.on('before-quit', () => {
  log.transports.console.level = false;
});

export class ElectronLoggerService implements NestLoggerService {
  logger: LogFunctions;
  readonly scope: string;
  constructor(scope: string) {
    this.scope = scope;
    this.logger = log.scope(scope);
  }

  formatMessage(
    level: 'info' | 'log' | 'error' | 'warn' | 'debug' | 'verbose' | 'fatal',
    message: any,
    optionalParams: any[]
  ) {
    const ctx = optionalParams.length > 0 ? optionalParams.at(-1) : '';
    const prefix = ctx ? `[${ctx}] ` : '';
    message = [
      message,
      ...optionalParams.slice(0, -1).map(v => {
        if (typeof v === 'object') {
          return JSON.stringify(v);
        }
        return v;
      }),
    ].join(' ');
    return [`[${level}]`, prefix + message];
  }

  info(message: any, ...optionalParams: any[]) {
    this.logger.info(...this.formatMessage('info', message, optionalParams));
  }

  log(message: any, ...optionalParams: any[]) {
    this.logger.log(...this.formatMessage('log', message, optionalParams));
  }

  error(message: any, ...optionalParams: any[]) {
    this.logger.error(...this.formatMessage('error', message, optionalParams));
  }

  warn(message: any, ...optionalParams: any[]) {
    this.logger.warn(...this.formatMessage('warn', message, optionalParams));
  }

  debug(message: any, ...optionalParams: any[]) {
    this.logger.debug(...this.formatMessage('debug', message, optionalParams));
  }

  verbose(message: any, ...optionalParams: any[]) {
    this.logger.verbose(
      ...this.formatMessage('verbose', message, optionalParams)
    );
  }

  fatal(message: any, ...optionalParams: any[]) {
    this.logger.error(...this.formatMessage('fatal', message, optionalParams));
  }
}
export function createLoggerService(scope: string) {
  return new ElectronLoggerService(scope);
}
