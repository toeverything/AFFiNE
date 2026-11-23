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

  static formatError(message: unknown, details: unknown) {
    if (details && typeof details === 'object' && !(details instanceof Error)) {
      const { error, ...fields } = details as Record<string, unknown>;
      return {
        message: { ...fields, message },
        stack: AFFiNELogger.formatStack(error),
      };
    }
    return { message, stack: AFFiNELogger.formatStack(details) };
  }

  override error(message: unknown, details?: unknown, context?: string) {
    const formatted = AFFiNELogger.formatError(message, details);
    super.error(formatted.message, formatted.stack, context);
  }
}
