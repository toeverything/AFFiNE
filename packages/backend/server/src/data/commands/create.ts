import { appendFileSync, writeFileSync } from 'node:fs';
import { join, parse } from 'node:path';
import { fileURLToPath } from 'node:url';

import { input } from '@inquirer/prompts';
import { Injectable, Logger } from '@nestjs/common';
import { camelCase, kebabCase, upperFirst } from 'lodash-es';

@Injectable()
export class CreateCommand {
  logger = new Logger(CreateCommand.name);

  async execute(name?: string): Promise<void> {
    let resolvedName = name;

    if (!resolvedName) {
      resolvedName = (
        await input({
          message: 'Name of the data migration script:',
          validate(value) {
            return value.trim().length > 0 || 'A migration name is required';
          },
        })
      ).trim();
    }

    const timestamp = Date.now();
    const content = this.createScript(
      upperFirst(camelCase(resolvedName)) + timestamp
    );
    const migrationDir = join(
      fileURLToPath(import.meta.url),
      '../../migrations'
    );
    const fileName = `${timestamp}-${kebabCase(resolvedName)}.ts`;
    const filePath = join(migrationDir, fileName);

    this.logger.log(`Creating ${fileName}...`);
    writeFileSync(filePath, content);
    const indexFile = join(migrationDir, 'index.ts');
    appendFileSync(
      indexFile,
      `export * from './${parse(fileName).name}';`,
      'utf-8'
    );
    this.logger.log(`Migration file created at ${filePath}`);
    this.logger.log('Done');
  }

  private createScript(name: string) {
    const contents = ["import { PrismaClient } from '@prisma/client';", ''];
    contents.push(`export class ${name} {`);
    contents.push('  // do the migration');
    contents.push('  static async up(db: PrismaClient) {}');
    contents.push('');
    contents.push('  // revert the migration');
    contents.push('  static async down(db: PrismaClient) {}');

    contents.push('}');

    return contents.join('\n');
  }
}
