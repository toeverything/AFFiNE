import { isInsideBlockByFlavour } from '@blocksuite/affine-shared/utils';
import type { SlashMenuConfig } from '@blocksuite/affine-widget-slash-menu';
import { CheckBoxCheckLinearIcon } from '@blocksuite/icons/lit';

import { insertTodoSummaryBlock } from '../utils.js';

export const todoSummarySlashMenuConfig: SlashMenuConfig = {
  disableWhen: ({ model }) => model.flavour === 'affine:todo-summary',
  items: [
    {
      name: 'Todo Summary',
      description: 'Show all todos in this page.',
      searchAlias: ['todo summary', 'task summary'],
      icon: CheckBoxCheckLinearIcon(),
      group: '4_Content & Media@1',
      when: ({ model }) =>
        !isInsideBlockByFlavour(model.store, model, 'affine:edgeless-text'),
      action: ({ model }) => {
        insertTodoSummaryBlock(model);
      },
    },
  ],
};
