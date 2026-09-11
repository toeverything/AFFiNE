import { I18n } from '@affine/i18n';
import { FeatureFlagService } from '@blocksuite/affine/shared/services';
import { Text } from '@blocksuite/affine/store';
import {
  type SlashMenuConfig,
  SlashMenuConfigExtension,
} from '@blocksuite/affine/widgets/slash-menu';
import { DatabaseKanbanViewIcon } from '@blocksuite/icons/lit';

import { BOARD_WIDGET_SIZE, WHITEBOARD_FLAVOURS } from '../../const';
import { insertGfxWidget } from '../../insert-widget';
import {
  createBoardDatabase,
  ensureKanbanView,
  findNearbyDatabaseId,
} from './hub';
import { BoardBlockSchema } from './model';
import type { BoardTemplate } from './types';

const flavour = BoardBlockSchema.model.flavour;

const boardSlashMenuConfig: SlashMenuConfig = {
  items: ({ std, model }) => {
    const enabled =
      std.store.schema.flavourSchemaMap.has(flavour) &&
      std.get(FeatureFlagService).getFlag('enable_board_widget');

    const insert = (template: BoardTemplate, blockId?: string) => {
      const title = I18n['com.affine.whiteboard.board.title']();
      let created = blockId;
      if (blockId) {
        ensureKanbanView(std.store, blockId);
      } else {
        created = createBoardDatabase(std.store, { title, template })
          ?.databaseId;
      }
      insertGfxWidget(
        std,
        flavour,
        {
          title: new Text(title),
          linkedDocId: std.store.id,
          blockId: created,
          template,
        },
        BOARD_WIDGET_SIZE
      );
    };

    return [
      {
        name: I18n['com.affine.whiteboard.board.slash-name'](),
        description: I18n['com.affine.whiteboard.board.slash-description'](),
        icon: DatabaseKanbanViewIcon(),
        searchAlias: ['kanban', 'board', 'wb:board', 'канбан', 'доска'],
        group: '4_Content & Media@15',
        when: () => enabled,
        action: () => insert('todo'),
      },
      {
        name: I18n['com.affine.whiteboard.board.template-project'](),
        description:
          I18n['com.affine.whiteboard.board.template-project-description'](),
        icon: DatabaseKanbanViewIcon(),
        searchAlias: ['project tracking', 'проект', 'канбан'],
        group: '4_Content & Media@16',
        when: () => enabled,
        action: () => insert('project'),
      },
      {
        name: I18n['com.affine.whiteboard.board.from-table'](),
        description:
          I18n['com.affine.whiteboard.board.from-table-description'](),
        icon: DatabaseKanbanViewIcon(),
        searchAlias: ['board from table', 'канбан из таблицы'],
        group: '4_Content & Media@17',
        when: () => enabled && !!findNearbyDatabaseId(std.store, model.id),
        action: ({ std, model }) => {
          insert('todo', findNearbyDatabaseId(std.store, model.id));
        },
      },
    ];
  },
};

export const BoardSlashMenuConfigExtension = SlashMenuConfigExtension(
  WHITEBOARD_FLAVOURS.board,
  boardSlashMenuConfig
);
