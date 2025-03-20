import { insertInlineLatex } from '@blocksuite/affine-inline-preset';
import {
  getSelectedModelsCommand,
  getTextSelectionCommand,
} from '@blocksuite/affine-shared/commands';
import { type SlashMenuConfig } from '@blocksuite/affine-widget-slash-menu';
import { TeXIcon } from '@blocksuite/icons/lit';

import { insertLatexBlockCommand } from '../commands';

export const latexSlashMenuConfig: SlashMenuConfig = {
  items: [
    {
      name: 'Inline equation',
      group: '0_Basic@8',
      description: 'Create a inline equation.',
      icon: TeXIcon(),
      searchAlias: ['inlineMath, inlineEquation', 'inlineLatex'],
      action: ({ std }) => {
        std.command
          .chain()
          .pipe(getTextSelectionCommand)
          .pipe(insertInlineLatex)
          .run();
      },
    },
    {
      name: 'Equation',
      description: 'Create a equation block.',
      icon: TeXIcon(),
      searchAlias: ['mathBlock, equationBlock', 'latexBlock'],
      group: '4_Content & Media@9',
      action: ({ std }) => {
        std.command
          .chain()
          .pipe(getSelectedModelsCommand)
          .pipe(insertLatexBlockCommand, {
            place: 'after',
            removeEmptyLine: true,
          })
          .run();
      },
    },
  ],
};
