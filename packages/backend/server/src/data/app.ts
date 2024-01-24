import { Module } from '@nestjs/common';

import { AppModule as BusinessAppModule } from '../app.module';
import { ConfigModule } from '../fundamentals/config';
import { CreateCommand, NameQuestion } from './commands/create';
import { RevertCommand, RunCommand } from './commands/run';

@Module({
  imports: [
    ConfigModule.forRoot({
      doc: {
        manager: {
          enableUpdateAutoMerging: false,
        },
      },
      metrics: {
        enabled: false,
      },
    }),
    BusinessAppModule,
  ],
  providers: [NameQuestion, CreateCommand, RunCommand, RevertCommand],
})
export class CliAppModule {}
