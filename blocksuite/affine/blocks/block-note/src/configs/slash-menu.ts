import {
  formatBlockCommand,
  type TextFormatConfig,
  textFormatConfigs,
} from '@blocksuite/affine-inline-preset';
import {
  type TextConversionConfig,
  textConversionConfigs,
} from '@blocksuite/affine-rich-text';
import { isInsideBlockByFlavour } from '@blocksuite/affine-shared/utils';
import {
  type SlashMenuActionItem,
  type SlashMenuConfig,
  SlashMenuConfigExtension,
  type SlashMenuItem,
} from '@blocksuite/affine-widget-slash-menu';
import { BlockSelection } from '@blocksuite/block-std';
import { HeadingsIcon } from '@blocksuite/icons/lit';

import { updateBlockType } from '../commands';
import { tooltips } from './tooltips';

let basicIndex = 0;
const noteSlashMenuConfig: SlashMenuConfig = {
  items: [
    ...textConversionConfigs
      .filter(i => i.type && ['h1', 'h2', 'h3', 'text'].includes(i.type))
      .map(config => createConversionItem(config, `0_Basic@${basicIndex++}`)),
    {
      name: 'Other Headings',
      icon: HeadingsIcon(),
      group: `0_Basic@${basicIndex++}`,
      subMenu: textConversionConfigs
        .filter(i => i.type && ['h4', 'h5', 'h6'].includes(i.type))
        .map(config => createConversionItem(config)),
    },
    ...textConversionConfigs
      .filter(i => i.flavour === 'affine:code')
      .map(config => createConversionItem(config, `0_Basic@${basicIndex++}`)),

    ...textConversionConfigs
      .filter(i => i.type && ['divider', 'quote'].includes(i.type))
      .map(
        config =>
          ({
            ...createConversionItem(config, `0_Basic@${basicIndex++}`),
            when: ({ model }) =>
              model.doc.schema.flavourSchemaMap.has(config.flavour) &&
              !isInsideBlockByFlavour(model.doc, model, 'affine:edgeless-text'),
          }) satisfies SlashMenuActionItem
      ),

    ...textConversionConfigs
      .filter(i => i.flavour === 'affine:list')
      .map((config, index) =>
        createConversionItem(config, `1_List@${index++}`)
      ),

    ...textFormatConfigs
      .filter(i => !['Code', 'Link'].includes(i.name))
      .map((config, index) =>
        createTextFormatItem(config, `2_Style@${index++}`)
      ),
  ],
};

function createConversionItem(
  config: TextConversionConfig,
  group?: SlashMenuItem['group']
): SlashMenuActionItem {
  const { name, description, icon, flavour, type } = config;
  return {
    name,
    group,
    description,
    icon,
    tooltip: tooltips[name],
    when: ({ model }) => model.doc.schema.flavourSchemaMap.has(flavour),
    action: ({ std }) => {
      std.command.exec(updateBlockType, {
        flavour,
        props: { type },
      });
    },
  };
}

function createTextFormatItem(
  config: TextFormatConfig,
  group?: SlashMenuItem['group']
): SlashMenuActionItem {
  const { name, icon, id, action } = config;
  return {
    name,
    icon,
    group,
    tooltip: tooltips[name],
    action: ({ std, model }) => {
      const { host } = std;

      if (model.text?.length !== 0) {
        std.command.exec(formatBlockCommand, {
          blockSelections: [
            std.selection.create(BlockSelection, {
              blockId: model.id,
            }),
          ],
          styles: { [id]: true },
        });
      } else {
        // like format bar when the line is empty
        action(host);
      }
    },
  };
}

export const NoteSlashMenuConfigExtension = SlashMenuConfigExtension(
  'affine:note',
  noteSlashMenuConfig
);
