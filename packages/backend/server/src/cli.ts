import { basename } from 'node:path';

import { type INestApplicationContext, Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Command, CommanderError } from 'commander';

import { CliAppModule } from './data/app';
import { CreateCommand } from './data/commands/create';
import { ImportConfigCommand } from './data/commands/import';
import { RevertCommand, RunCommand } from './data/commands/run';

function getProgramName() {
  return process.env.npm_lifecycle_event ?? basename(process.argv[1] ?? 'cli');
}

async function withCliApp(
  logger: Logger,
  callback: (app: INestApplicationContext) => Promise<void>
) {
  const app = await NestFactory.createApplicationContext(CliAppModule, {
    logger,
  });

  try {
    await callback(app);
  } finally {
    await app.close();
  }
}

function buildProgram(logger: Logger) {
  const program = new Command();

  program
    .name(getProgramName())
    .description('AFFiNE server CLI')
    .showHelpAfterError()
    .showSuggestionAfterError();

  program
    .command('create [name]')
    .description('create a data migration script')
    .action(async name => {
      await withCliApp(logger, async app => {
        await app.get(CreateCommand).execute(name);
      });
    });

  program
    .command('run')
    .description('Run all pending data migrations')
    .action(async () => {
      await withCliApp(logger, async app => {
        await app.get(RunCommand).execute();
      });
    });

  program
    .command('revert [name]')
    .description('Revert one data migration with given name')
    .action(async name => {
      await withCliApp(logger, async app => {
        await app.get(RevertCommand).execute(name);
      });
    });

  program
    .command('import-config [path]')
    .description('import config from a file')
    .action(async path => {
      await withCliApp(logger, async app => {
        await app.get(ImportConfigCommand).execute(path);
      });
    });

  return program;
}

export async function run() {
  const logger = new Logger('Cli');

  try {
    const program = buildProgram(logger);
    program.exitOverride();

    const argv =
      process.argv.length > 2 ? process.argv : [...process.argv, '--help'];
    await program.parseAsync(argv);
  } catch (error) {
    if (error instanceof CommanderError) {
      process.exitCode = error.exitCode;
      return;
    }

    if (error instanceof Error) {
      logger.error(error.message, error.stack);
    } else {
      logger.error(String(error));
    }
    process.exitCode = 1;
  }
}
