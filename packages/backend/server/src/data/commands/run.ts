import { Injectable, Logger } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { PrismaClient } from '@prisma/client';
import { once } from 'lodash-es';

import { BackendRuntimeProvider } from '../../core/backend-runtime';
import { StorageRuntimeProvider } from '../../core/storage-runtime';
import * as migrationImports from '../migrations';

interface Migration {
  name: string;
  always?: boolean;
  up: (db: PrismaClient, injector: ModuleRef) => Promise<void>;
  down: (db: PrismaClient, injector: ModuleRef) => Promise<void>;
  order: number;
}

const LEGACY_CONTEXT_BLOB_ARTIFACT_MIGRATION =
  'MigrateLegacyContextBlobArtifacts1786820000000';

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
    await this.injector
      .get(BackendRuntimeProvider, { strict: false })
      .runMigrations();
    await this.injector
      .get(StorageRuntimeProvider, { strict: false })
      .runMigrations();
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

  async admitLegacyContextBlobs(): Promise<void> {
    const tables = await this.db.$queryRaw<
      Array<{
        contexts: string | null;
        sessions: string | null;
        blobs: string | null;
        artifacts: string | null;
      }>
    >`
      SELECT
        to_regclass('public.ai_contexts')::text AS contexts,
        to_regclass('public.ai_sessions_metadata')::text AS sessions,
        to_regclass('public.blobs')::text AS blobs,
        to_regclass('public.workspace_artifacts')::text AS artifacts
    `;

    const schemaExists = Object.values(tables[0] ?? {}).every(Boolean);
    if (!schemaExists) {
      this.logger.log(
        'Skipping legacy context blob admission because its source schema is not present.'
      );
      return;
    }

    await this.runOne(LEGACY_CONTEXT_BLOB_ARTIFACT_MIGRATION);
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
