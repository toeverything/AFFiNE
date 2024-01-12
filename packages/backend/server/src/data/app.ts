import '../prelude';

import { Logger, Module } from '@nestjs/common';
import { CommandFactory } from 'nest-commander';

import { AppModule as BusinessAppModule } from '../app';
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
    }),
    BusinessAppModule,
  ],
  providers: [NameQuestion, CreateCommand, RunCommand, RevertCommand],
})
class AppModule {}

async function bootstrap() {
  await CommandFactory.run(AppModule, new Logger()).catch(e => {
    console.error(e);
    process.exit(1);
  });
  process.exit(0);
}

await bootstrap();
