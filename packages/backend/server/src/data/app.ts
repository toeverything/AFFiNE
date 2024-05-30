import { Module } from '@nestjs/common';

import { AppModule as BusinessAppModule } from '../app.module';
import { CreateCommand, NameQuestion } from './commands/create';
import { RevertCommand, RunCommand } from './commands/run';

@Module({
  imports: [BusinessAppModule],
  providers: [NameQuestion, CreateCommand, RunCommand, RevertCommand],
})
export class CliAppModule {}
