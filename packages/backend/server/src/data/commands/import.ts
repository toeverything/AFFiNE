import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { Injectable, Logger } from '@nestjs/common';

import { ConfigFactory, InvalidAppConfigInput } from '../../base';
import { Models } from '../../models';

@Injectable()
export class ImportConfigCommand {
  logger = new Logger(ImportConfigCommand.name);

  constructor(
    private readonly models: Models,
    private readonly configFactory: ConfigFactory
  ) {}

  async execute(path?: string): Promise<void> {
    if (!path) {
      throw new Error('A config file path is required');
    }

    path = resolve(process.cwd(), path);

    const overrides: Record<string, Record<string, any>> = JSON.parse(
      readFileSync(path, 'utf-8')
    );

    const forValidation: { module: string; key: string; value: any }[] = [];
    const forSaving: { key: string; value: any }[] = [];
    Object.entries(overrides).forEach(([module, config]) => {
      if (module === '$schema') {
        return;
      }

      Object.entries(config).forEach(([key, value]) => {
        forValidation.push({
          module,
          key,
          value,
        });
        forSaving.push({
          key: `${module}.${key}`,
          value,
        });
      });
    });

    const errors = this.configFactory.validate(forValidation);

    if (errors?.length) {
      throw new InvalidAppConfigInput({
        message: errors.map(error => error.message).join('\n '),
      });
    }

    // @ts-expect-error null as user id
    await this.models.appConfig.save(null, forSaving);
  }
}
