import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { Injectable } from '@nestjs/common';

import { ServerService } from '../../core/config';

@Injectable()
export class ImportConfigCommand {
  constructor(private readonly server: ServerService) {}

  async execute(path?: string): Promise<void> {
    if (!path) {
      throw new Error('A config file path is required');
    }

    path = resolve(process.cwd(), path);

    const overrides: Record<string, Record<string, any>> = JSON.parse(
      readFileSync(path, 'utf-8')
    );

    const updates: { module: string; key: string; value: any }[] = [];
    Object.entries(overrides).forEach(([module, config]) => {
      if (module === '$schema') {
        return;
      }

      Object.entries(config).forEach(([key, value]) => {
        updates.push({
          module,
          key,
          value,
        });
      });
    });

    await this.server.updateConfig(null, updates, false);
  }
}
