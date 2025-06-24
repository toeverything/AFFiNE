import { bootstrap } from './bootstrap';
import { logger } from './logger';

bootstrap().catch(err => {
  logger.error(err);
  process.exit(1);
});
