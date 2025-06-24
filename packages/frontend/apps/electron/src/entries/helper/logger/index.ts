import { Global, Logger, Module, Scope } from '@nestjs/common';

import { createLoggerService } from '../../../logger';

export const logger = createLoggerService('helper');

@Global()
@Module({
  providers: [
    {
      scope: Scope.TRANSIENT,
      provide: Logger,
      useValue: logger,
    },
  ],
  exports: [Logger],
})
export class LoggerModule {}
