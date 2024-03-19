import '../prelude';

import { Logger } from '@nestjs/common';
import { CommandFactory } from 'nest-commander';

async function bootstrap() {
  const { CliAppModule } = await import('./app');
  await CommandFactory.run(CliAppModule, new Logger()).catch(e => {
    console.error(e);
    process.exit(1);
  });
  process.exit(0);
}

await bootstrap();
