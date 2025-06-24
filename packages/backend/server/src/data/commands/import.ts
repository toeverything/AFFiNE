import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { Logger } from '@nestjs/common';
import { Command, CommandRunner } from 'nest-commander';

import { ConfigFactory, InvalidAppConfigInput } from '../../base';
import { Models } from '../../models';

@Command({
  name: 'import-config',
  arguments: '[name]',
  description: 'import config from a file',
})
export class ImportConfigCommand extends CommandRunner {
  logger = new Logger(ImportConfigCommand.name);

  constructor(
    private readonly models: Models,
    private readonly configFactory: ConfigFactory
  ) {
    super();
  }

  override async run(inputs: string[]): Promise<void> {
    let path = inputs[0];
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
