import { EmbedLinkedDocBlockSchema } from '@blocksuite/affine-model';
import {
  getInlineEditorByModel,
  insertContent,
} from '@blocksuite/affine-rich-text';
import { REFERENCE_NODE } from '@blocksuite/affine-shared/consts';
import { createDefaultDoc } from '@blocksuite/affine-shared/utils';
import {
  type SlashMenuConfig,
  SlashMenuConfigIdentifier,
} from '@blocksuite/affine-widget-slash-menu';
import { LinkedPageIcon, PlusIcon } from '@blocksuite/icons/lit';
import { type ExtensionType } from '@blocksuite/store';

import { LinkDocTooltip, NewDocTooltip } from './tooltips';

const linkedDocSlashMenuConfig: SlashMenuConfig = {
  items: [
    {
      name: 'New Doc',
      description: 'Start a new document.',
      icon: PlusIcon(),
      tooltip: {
        figure: NewDocTooltip,
        caption: 'New Doc',
      },
      group: '3_Page@0',
      when: ({ model }) =>
        model.doc.schema.flavourSchemaMap.has('affine:embed-linked-doc'),
      action: ({ std, model }) => {
        const newDoc = createDefaultDoc(std.host.doc.workspace);
        insertContent(std, model, REFERENCE_NODE, {
          reference: {
            type: 'LinkedPage',
            pageId: newDoc.id,
          },
        });
      },
    },
    {
      name: 'Linked Doc',
      description: 'Link to another document.',
      icon: LinkedPageIcon(),
      tooltip: {
        figure: LinkDocTooltip,
        caption: 'Link Doc',
      },
      searchAlias: ['dual link'],
      group: '3_Page@1',
      when: ({ std, model }) => {
        const root = model.doc.root;
        if (!root) return false;
        const linkedDocWidget = std.view.getWidget(
          'affine-linked-doc-widget',
          root.id
        );
        if (!linkedDocWidget) return false;

        return model.doc.schema.flavourSchemaMap.has('affine:embed-linked-doc');
      },
      action: ({ model, std }) => {
        const root = model.doc.root;
        if (!root) return;
        const linkedDocWidget = std.view.getWidget(
          'affine-linked-doc-widget',
          root.id
        );
        if (!linkedDocWidget) return;
        // TODO(@L-Sun): make linked-doc-widget as extension
        // @ts-expect-error same as above
        const triggerKey = linkedDocWidget.config.triggerKeys[0];

        insertContent(std, model, triggerKey);

        const inlineEditor = getInlineEditorByModel(std, model);
        if (inlineEditor) {
          // Wait for range to be updated
          const subscription = inlineEditor.slots.inlineRangeSync.subscribe(
            () => {
              // TODO(@L-Sun): make linked-doc-widget as extension
              subscription.unsubscribe();
              // @ts-expect-error same as above
              linkedDocWidget.show({ addTriggerKey: true });
            }
          );
        }
      },
    },
  ],
};

export const LinkedDocSlashMenuConfigIdentifier = SlashMenuConfigIdentifier(
  EmbedLinkedDocBlockSchema.model.flavour
);

export const LinkedDocSlashMenuConfigExtension: ExtensionType = {
  setup: di => {
    di.addImpl(LinkedDocSlashMenuConfigIdentifier, linkedDocSlashMenuConfig);
  },
};
