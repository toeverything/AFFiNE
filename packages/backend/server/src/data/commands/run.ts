import { Injectable, Logger } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { PrismaClient } from '@prisma/client';
import { once } from 'lodash-es';

import * as migrationImports from '../migrations';

interface Migration {
  name: string;
  always?: boolean;
  up: (db: PrismaClient, injector: ModuleRef) => Promise<void>;
  down: (db: PrismaClient, injector: ModuleRef) => Promise<void>;
  order: number;
}

export const collectMigrations = once(() => {
  const migrations = Object.values(migrationImports).map(migration => {
    const order = Number(migration.name.match(/([\d]+)$/)?.[1]);

    if (Number.isNaN(order)) {
      throw new Error(`Invalid migration name: ${migration.name}`);
    }

    return {
      name: migration.name,
      // @ts-expect-error optional
      always: migration.always,
      up: migration.up,
      down: migration.down,
      order,
    };
  }) as Migration[];

  return migrations.sort((a, b) => a.order - b.order);
});

@Injectable()
export class RunCommand {
  logger = new Logger(RunCommand.name);
  constructor(
    private readonly db: PrismaClient,
    private readonly injector: ModuleRef
  ) {}

  async execute(): Promise<void> {
    const migrations = collectMigrations();
    const done: Migration[] = [];
    for (const migration of migrations) {
      const exists = await this.db.dataMigration.count({
        where: {
          name: migration.name,
        },
      });

      if (exists && !migration.always) {
        continue;
      }

      await this.runMigration(migration);

      done.push(migration);
    }

    this.logger.log(`Done ${done.length} migrations`);
    done.forEach(migration => {
      this.logger.log(`  ✔ ${migration.name}`);
    });
  }

  async runOne(name: string) {
    const migrations = collectMigrations();
    const migration = migrations.find(m => m.name === name);

    if (!migration) {
      throw new Error(`Unknown migration name: ${name}.`);
    }
    const exists = await this.db.dataMigration.count({
      where: {
        name: migration.name,
      },
    });

    if (exists) return;

    await this.runMigration(migration);
  }

  private async runMigration(migration: Migration) {
    this.logger.log(`Running ${migration.name}...`);
    const record = await this.db.dataMigration.upsert({
      where: {
        name: migration.name,
      },
      update: {
        startedAt: new Date(),
      },
      create: {
        name: migration.name,
        startedAt: new Date(),
      },
    });

    try {
      await migration.up(this.db, this.injector);
    } catch (e) {
      await this.db.dataMigration.delete({
        where: {
          id: record.id,
        },
      });
      await migration.down(this.db, this.injector);
      this.logger.error('Failed to run data migration', e);
      throw e;
    }

    await this.db.dataMigration.update({
      where: {
        id: record.id,
      },
      data: {
        finishedAt: new Date(),
      },
    });
  }
}

@Injectable()
export class RevertCommand {
  logger = new Logger(RevertCommand.name);

  constructor(
    private readonly db: PrismaClient,
    private readonly injector: ModuleRef
  ) {}

  async execute(name?: string): Promise<void> {
    if (!name) {
      throw new Error('A migration name is required');
    }

    const migrations = collectMigrations();

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
      await migration.down(this.db, this.injector);
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
