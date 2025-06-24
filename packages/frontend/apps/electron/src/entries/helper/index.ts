import { bootstrap } from './bootstrap';

bootstrap().catch(err => {
  console.error(err);
  process.exit(1);
});
