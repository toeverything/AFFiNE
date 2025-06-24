import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';
import { logger } from './logger';

export async function bootstrap() {
  // Process setup for parentPort message handling is done inside HelperBootstrapService
  // which is automatically instantiated when the module initializes
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger,
  });

  // Handle shutdown
  process.on('exit', () => {
    app.close().catch(err => {
      logger.error('Failed to close Nest application context', err);
    });
  });

  return app;
}
