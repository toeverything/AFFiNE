import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Logger } from '@nestjs/common';
import { camelCase, kebabCase, upperFirst } from 'lodash-es';
import {
  Command,
  CommandRunner,
  InquirerService,
  Question,
  QuestionSet,
} from 'nest-commander';

@QuestionSet({ name: 'name-questions' })
export class NameQuestion {
  @Question({
    name: 'name',
    message: 'Name of the data action script:',
  })
  parseName(val: string) {
    return val.trim();
  }
}

@Command({
  name: 'create',
  arguments: '[name]',
  description: 'create a bootstrap action script',
})
export class CreateCommand extends CommandRunner {
  logger = new Logger(CreateCommand.name);
  constructor(private readonly inquirer: InquirerService) {
    super();
  }

  override async run(inputs: string[]): Promise<void> {
    let name = inputs[0];

    if (!name) {
      name = (
        await this.inquirer.ask<{ name: string }>('name-questions', undefined)
      ).name;
    }

    const timestamp = Date.now();
    const content = this.createScript(upperFirst(camelCase(name)) + timestamp);
    const fileName = `${timestamp}-${kebabCase(name)}.ts`;
    const filePath = join(
      fileURLToPath(import.meta.url),
      '../../actions',
      fileName
    );

    this.logger.log(`Creating ${fileName}...`);
    writeFileSync(filePath, content);
    this.logger.log('Action file created at', filePath);
    this.logger.log('Done');
  }

  private createScript(name: string) {
    return `
import { PrismaClient } from '@prisma/client';

export class ${name} {
  // do the action
  static async run(db: PrismaClient) {}
}
`;
  }
}
