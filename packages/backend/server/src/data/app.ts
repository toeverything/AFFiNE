import { Module } from '@nestjs/common';

import { FunctionalityModules } from '../app.module';
import { CreateCommand, NameQuestion } from './commands/create';
import { ImportConfigCommand } from './commands/import';
import { RevertCommand, RunCommand } from './commands/run';

@Module({
  imports: FunctionalityModules,
  providers: [
    NameQuestion,
    CreateCommand,
    RunCommand,
    RevertCommand,
    ImportConfigCommand,
  ],
})
export class CliAppModule {}
