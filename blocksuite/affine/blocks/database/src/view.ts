import type { MenuOptions } from '@blocksuite/affine-components/context-menu';
import {
  type ViewExtensionContext,
  ViewExtensionProvider,
} from '@blocksuite/affine-ext-loader';
import { DatabaseBlockModel } from '@blocksuite/affine-model';
import { SlashMenuConfigExtension } from '@blocksuite/affine-widget-slash-menu';
import { BlockViewExtension, FlavourExtension } from '@blocksuite/std';
import { literal } from 'lit/static-html.js';
import { z } from 'zod';

import { DatabaseConfigExtension } from './config';
import { databaseSlashMenuConfig } from './configs/slash-menu.js';
import { effects } from './effects';

const optionsSchema = z.object({
  configure: z
    .function()
    .args(z.instanceof(DatabaseBlockModel), z.custom<MenuOptions>())
    .returns(z.custom<MenuOptions>()),
});

export type DatabaseViewExtensionOptions = z.infer<typeof optionsSchema>;

export class DatabaseViewExtension extends ViewExtensionProvider<DatabaseViewExtensionOptions> {
  override name = 'affine-database-block';

  override schema = optionsSchema;

  override effect() {
    super.effect();
    effects();
  }

  override setup(
    context: ViewExtensionContext,
    options?: DatabaseViewExtensionOptions
  ) {
    super.setup(context);
    context.register([
      FlavourExtension('affine:database'),
      BlockViewExtension('affine:database', literal`affine-database`),
      SlashMenuConfigExtension('affine:database', databaseSlashMenuConfig),
    ]);
    if (options) {
      context.register(
        DatabaseConfigExtension({ configure: options.configure })
      );
    }
  }
}
