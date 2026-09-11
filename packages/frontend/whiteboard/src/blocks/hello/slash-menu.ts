import { I18n } from '@affine/i18n';
import { FeatureFlagService } from '@blocksuite/affine/shared/services';
import {
  type SlashMenuConfig,
  SlashMenuConfigExtension,
} from '@blocksuite/affine/widgets/slash-menu';
import { ShapeIcon } from '@blocksuite/icons/lit';

import { HELLO_WIDGET_SIZE, WHITEBOARD_FLAVOURS } from '../../const';
import { insertGfxWidget } from '../../insert-widget';
import { HelloBlockSchema } from './model';

const flavour = HelloBlockSchema.model.flavour;

const helloSlashMenuConfig: SlashMenuConfig = {
  items: () => [
    {
      name: I18n['com.affine.whiteboard.hello.slash-name'](),
      description: I18n['com.affine.whiteboard.hello.slash-description'](),
      icon: ShapeIcon(),
      searchAlias: ['hello', 'whiteboard', 'wb:hello', 'виджет'],
      group: '4_Content & Media@12',
      when: ({ std }) =>
        std.store.schema.flavourSchemaMap.has(flavour) &&
        std.get(FeatureFlagService).getFlag('enable_whiteboard_hello') &&
        !std.store.readonly,
      action: ({ std }) => {
        insertGfxWidget(std, flavour, {}, HELLO_WIDGET_SIZE);
      },
    },
  ],
};

export const HelloSlashMenuConfigExtension = SlashMenuConfigExtension(
  WHITEBOARD_FLAVOURS.hello,
  helloSlashMenuConfig
);
