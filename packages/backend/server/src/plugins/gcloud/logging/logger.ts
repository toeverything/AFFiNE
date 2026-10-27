import { WinstonLogger } from 'nest-winston';

import { AFFiNELogger as RawAFFiNELogger } from '../../../base/logger';

export class AFFiNELogger extends WinstonLogger {
  override error(message: unknown, details?: unknown, context?: string) {
    const formatted = RawAFFiNELogger.formatError(message, details);
    super.error(formatted.message, formatted.stack as string, context);
  }
}
