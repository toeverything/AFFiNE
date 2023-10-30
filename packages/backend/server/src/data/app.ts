import { Logger, Module } from '@nestjs/common';
import { CommandFactory } from 'nest-commander';

import { PrismaModule } from '../prisma';
import { CreateCommand, NameQuestion } from './commands/create';
import { RevertCommand, RunCommand } from './commands/run';

@Module({
  imports: [PrismaModule],
  providers: [NameQuestion, CreateCommand, RunCommand, RevertCommand],
})
class AppModule {}

async function bootstrap() {
  await CommandFactory.run(AppModule, new Logger());
}

await bootstrap();
