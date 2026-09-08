import { Module } from '@nestjs/common';

import { FunctionalityModules } from '../app.module';
import { CreateCommand } from './commands/create';
import { CutoverCommand } from './commands/cutover';
import { ImportConfigCommand } from './commands/import';
import { RevertCommand, RunCommand } from './commands/run';

@Module({
  imports: FunctionalityModules,
  providers: [
    CreateCommand,
    CutoverCommand,
    RunCommand,
    RevertCommand,
    ImportConfigCommand,
  ],
})
export class CliAppModule {}
