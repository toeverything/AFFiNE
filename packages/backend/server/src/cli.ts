import { Logger } from '@nestjs/common';
import { CommandFactory } from 'nest-commander';

import { CliAppModule } from './data/app';

export async function run() {
  await CommandFactory.run(CliAppModule, new Logger()).catch(e => {
    console.error(e);
    process.exit(1);
  });
  process.exit(0);
}
