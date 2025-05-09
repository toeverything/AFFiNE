import { WinstonLogger } from 'nest-winston';

import { AFFiNELogger as RawAFFiNELogger } from '../../../base/logger';

export class AFFiNELogger extends WinstonLogger {
  override error(
    message: any,
    stackOrError?: Error | string | unknown,
    context?: string
  ) {
    super.error(
      message,
      RawAFFiNELogger.formatStack(stackOrError) as string,
      context
    );
  }
}
