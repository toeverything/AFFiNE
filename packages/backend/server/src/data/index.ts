import '../prelude';

import { Logger } from '@nestjs/common';
import { CommandFactory } from 'nest-commander';

import { CliAppModule } from './app';

async function bootstrap() {
  await CommandFactory.run(CliAppModule, new Logger()).catch(e => {
    console.error(e);
    process.exit(1);
  });
  process.exit(0);
}

await bootstrap();
