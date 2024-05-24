import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { PrismaClient } from '@prisma/client';

interface Action {
  file: string;
  name: string;
  run: (db: PrismaClient, injector: ModuleRef) => Promise<void>;
}

@Injectable()
export class BootstrapService implements OnModuleInit {
  private readonly logger = new Logger(BootstrapService.name);

  constructor(
    private readonly db: PrismaClient,
    private readonly injector: ModuleRef
  ) {}

  async onModuleInit() {
    const actions = await this.collectActions();

    for (const action of actions) {
      await this.runAction(action);
    }
  }

  private async collectActions(): Promise<Action[]> {
    const folder = join(fileURLToPath(import.meta.url), '../actions');

    const actionFiles = readdirSync(folder)
      .filter(desc =>
        desc.endsWith(import.meta.url.endsWith('.ts') ? '.ts' : '.js')
      )
      .map(desc => join(folder, desc));

    actionFiles.sort((a, b) => a.localeCompare(b));

    const actions: Action[] = (
      await Promise.all(
        actionFiles.map(async file => {
          const path = pathToFileURL(file);
          return import(path.href).then(mod => {
            const { name, run } = mod[Object.keys(mod)[0]];
            if (!name || !run || typeof run !== 'function') {
              this.logger.warn(`Uncompleted action: ${path.pathname}`);
              return null;
            }
            return { file, name, run };
          });
        })
      )
    ).filter((v): v is Action => !!v);

    return actions;
  }

  private async runAction(action: Action) {
    this.logger.log(`Running ${action.name}...`);

    try {
      await action.run(this.db, this.injector);
    } catch (e) {
      this.logger.error(`Failed to run action ${action.name}: `, e);
      process.exit(1);
    }
  }
}
