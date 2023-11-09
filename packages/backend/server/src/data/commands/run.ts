import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Logger } from '@nestjs/common';
import { Command, CommandRunner } from 'nest-commander';

import { PrismaService } from '../../prisma';

interface Migration {
  file: string;
  name: string;
  up: (db: PrismaService) => Promise<void>;
  down: (db: PrismaService) => Promise<void>;
}

async function collectMigrations(): Promise<Migration[]> {
  const folder = join(fileURLToPath(import.meta.url), '../../migrations');

  const migrationFiles = readdirSync(folder)
    .filter(desc =>
      desc.endsWith(import.meta.url.endsWith('.ts') ? '.ts' : '.js')
    )
    .map(desc => join(folder, desc));

  const migrations: Migration[] = await Promise.all(
    migrationFiles.map(async file => {
      return import(file).then(mod => {
        const migration = mod[Object.keys(mod)[0]];

        return {
          file,
          name: migration.name,
          up: migration.up,
          down: migration.down,
        };
      });
    })
  );

  return migrations;
}
@Command({
  name: 'run',
  description: 'Run all pending data migrations',
})
export class RunCommand extends CommandRunner {
  logger = new Logger(RunCommand.name);
  constructor(private readonly db: PrismaService) {
    super();
  }

  override async run(): Promise<void> {
    const migrations = await collectMigrations();
    const done: Migration[] = [];
    for (const migration of migrations) {
      const exists = await this.db.dataMigration.count({
        where: {
          name: migration.name,
        },
      });

      if (exists) {
        continue;
      }

      this.logger.log(`Running ${migration.name}...`);
      const record = await this.db.dataMigration.create({
        data: {
          name: migration.name,
          startedAt: new Date(),
        },
      });

      try {
        await migration.up(this.db);
      } catch (e) {
        await this.db.dataMigration.delete({
          where: {
            id: record.id,
          },
        });
        await migration.down(this.db);
        this.logger.error('Failed to run data migration', e);
        process.exit(1);
      }

      await this.db.dataMigration.update({
        where: {
          id: record.id,
        },
        data: {
          finishedAt: new Date(),
        },
      });
      done.push(migration);
    }

    this.logger.log(`Done ${done.length} migrations`);
    done.forEach(migration => {
      this.logger.log(`  ✔ ${migration.name}`);
    });
  }
}

@Command({
  name: 'revert',
  arguments: '[name]',
  description: 'Revert one data migration with given name',
})
export class RevertCommand extends CommandRunner {
  logger = new Logger(RevertCommand.name);

  constructor(private readonly db: PrismaService) {
    super();
  }

  override async run(inputs: string[]): Promise<void> {
    const name = inputs[0];
    if (!name) {
      throw new Error('A migration name is required');
    }

    const migrations = await collectMigrations();

    const migration = migrations.find(m => m.name === name);

    if (!migration) {
      this.logger.error('Available migration names:');
      migrations.forEach(m => {
        this.logger.error(`  - ${m.name}`);
      });
      throw new Error(`Unknown migration name: ${name}.`);
    }

    const record = await this.db.dataMigration.findFirst({
      where: {
        name: migration.name,
      },
    });

    if (!record) {
      throw new Error(`Migration ${name} has not been executed.`);
    }

    try {
      this.logger.log(`Reverting ${name}...`);
      await migration.down(this.db);
      this.logger.log('Done reverting');
    } catch (e) {
      this.logger.error(`Failed to revert data migration ${name}`, e);
    }

    await this.db.dataMigration.delete({
      where: {
        id: record.id,
      },
    });
  }
}
