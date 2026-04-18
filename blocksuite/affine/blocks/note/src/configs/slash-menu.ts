import {
  formatBlockCommand,
  type TextFormatConfig,
  textFormatConfigs,
} from '@blocksuite/affine-inline-preset';
import {
  type TextAlignConfig,
  textAlignConfigs,
  type TextConversionConfig,
  textConversionConfigs,
} from '@blocksuite/affine-rich-text';
import {
  focusBlockEnd,
  getSelectedModelsCommand,
  getTextSelectionCommand,
} from '@blocksuite/affine-shared/commands';
import { isInsideBlockByFlavour } from '@blocksuite/affine-shared/utils';
import {
  type SlashMenuActionItem,
  type SlashMenuConfig,
  SlashMenuConfigExtension,
  type SlashMenuItem,
} from '@blocksuite/affine-widget-slash-menu';
import { HeadingsIcon, LayoutIcon } from '@blocksuite/icons/lit';
import { BlockSelection } from '@blocksuite/std';

import {
  insertColumnsBlockCommand,
  updateBlockAlign,
  updateBlockType,
} from '../commands';
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
    createColumnsItem(2, `0_Basic@${basicIndex++}`),
    createColumnsItem(3, `0_Basic@${basicIndex++}`),

    ...textConversionConfigs
      .filter(i => i.type && ['divider', 'quote'].includes(i.type))
      .map(
        config =>
          ({
            ...createConversionItem(config, `0_Basic@${basicIndex++}`),
            when: ({ model }) =>
              model.store.schema.flavourSchemaMap.has(config.flavour) &&
              !isInsideBlockByFlavour(
                model.store,
                model,
                'affine:edgeless-text'
              ),
          }) satisfies SlashMenuActionItem
      ),

    ...textConversionConfigs
      .filter(i => i.flavour === 'affine:list')
      .map((config, index) =>
        createConversionItem(config, `1_List@${index++}`)
      ),

    ...textAlignConfigs.map((config, index) =>
      createAlignItem(config, `2_Align@${index++}`)
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
  const { name, description, icon, flavour, type, searchAlias = [] } = config;
  return {
    name,
    group,
    description,
    icon,
    searchAlias,
    tooltip: tooltips[name],
    when: ({ model }) => model.store.schema.flavourSchemaMap.has(flavour),
    action: ({ std }) => {
      std.command.exec(updateBlockType, {
        flavour,
        props: { type },
      });
    },
  };
}

function createAlignItem(
  config: TextAlignConfig,
  group?: SlashMenuItem['group']
): SlashMenuActionItem {
  const { textAlign, name, icon } = config;
  return {
    name,
    group,
    icon,
    action: ({ std }) => {
      std.command
        .chain()
        .pipe(getTextSelectionCommand)
        .pipe(getSelectedModelsCommand, { types: ['text'] })
        .pipe(updateBlockAlign, { textAlign })
        .run();
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

function createColumnsItem(
  columnCount: number,
  group?: SlashMenuItem['group']
): SlashMenuActionItem {
  return {
    name: `${columnCount} Columns`,
    group,
    description: 'Create side-by-side columns.',
    icon: LayoutIcon(),
    searchAlias: ['column', 'columns', 'layout'],
    when: ({ model }) =>
      !isInsideBlockByFlavour(model.store, model, 'affine:edgeless-text') &&
      model.parent?.flavour === 'affine:note',
    action: ({ std }) => {
      std.command
        .chain()
        .pipe(getSelectedModelsCommand)
        .pipe(insertColumnsBlockCommand, {
          columnCount,
          place: 'after',
          removeEmptyLine: true,
        })
        .pipe(({ insertedColumnsBlockId }) => {
          if (!insertedColumnsBlockId) {
            return;
          }
          std.host.updateComplete
            .then(() => {
              const columns = std.store.getModelById(insertedColumnsBlockId);
              const firstParagraphId = columns?.children[0]?.children[0]?.id;
              if (!firstParagraphId) {
                return;
              }
              const firstParagraph = std.view.getBlock(firstParagraphId);
              if (!firstParagraph) {
                return;
              }
              std.command.exec(focusBlockEnd, {
                focusBlock: firstParagraph,
              });
            })
            .catch(console.error);
        })
        .run();
    },
  };
}

export const NoteSlashMenuConfigExtension = SlashMenuConfigExtension(
  'affine:note',
  noteSlashMenuConfig
);
