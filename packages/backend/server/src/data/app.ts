import { Module } from '@nestjs/common';

import { FunctionalityModules } from '../app.module';
import { CreateCommand } from './commands/create';
import { ImportConfigCommand } from './commands/import';
import { RevertCommand, RunCommand } from './commands/run';

@Module({
  imports: FunctionalityModules,
  providers: [CreateCommand, RunCommand, RevertCommand, ImportConfigCommand],
})
export class CliAppModule {}
