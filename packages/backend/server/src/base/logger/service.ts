import { ConsoleLogger, Injectable, type LogLevel } from '@nestjs/common';
import { ClsServiceManager } from 'nestjs-cls';

import { UserFriendlyError } from '../error';

// DO NOT use this Logger directly
// Use it via this way: `private readonly logger = new Logger(MyService.name)`
@Injectable()
export class AFFiNELogger extends ConsoleLogger {
  override stringifyMessage(message: unknown, logLevel: LogLevel) {
    const messageString = super.stringifyMessage(message, logLevel);
    const requestId = AFFiNELogger.getRequestId();
    if (!requestId) {
      return messageString;
    }
    return `<${requestId}> ${messageString}`;
  }

  static getRequestId(): string | undefined {
    return ClsServiceManager.getClsService()?.getId();
  }

  static formatStack(stackOrError?: Error | string | unknown) {
    if (stackOrError instanceof Error) {
      let err = stackOrError;

      // most of the internal error are caught and created by `GlobalExceptionFilter`,
      // and their error stack is helpless
      if (err instanceof UserFriendlyError) {
        return err.stacktrace;
      }

      let stack = err.stack ?? '';
      if (err.cause instanceof Error && err.cause.stack) {
        stack += `\n\nCaused by:\n\n${err.cause.stack}`;
      }
      return stack;
    }
    return stackOrError;
  }

  /**
   * Nestjs ConsoleLogger.error() will not print the stack trace if the error is an instance of Error
   * This method is a workaround to print the stack trace
   *
   * Usage:
   * ```
   * this.logger.error('some error happens', errInstance);
   * ```
   */
  override error(
    message: any,
    stackOrError?: Error | string | unknown,
    context?: string
  ) {
    super.error(message, AFFiNELogger.formatStack(stackOrError), context);
  }
}
