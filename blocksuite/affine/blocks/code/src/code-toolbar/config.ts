import {
  CancelWrapIcon,
  CaptionIcon,
  CopyIcon,
  DeleteIcon,
  DuplicateIcon,
  WrapIcon,
} from '@blocksuite/affine-components/icons';
import type { MenuItemGroup } from '@blocksuite/affine-components/toolbar';
import { isInsidePageEditor } from '@blocksuite/affine-shared/utils';
import { noop, sleep } from '@blocksuite/global/utils';
import { BlockSelection } from '@blocksuite/std';
import { html } from 'lit';
import { ifDefined } from 'lit/directives/if-defined.js';

import type { CodeBlockToolbarContext } from './context.js';
import { duplicateCodeBlock } from './utils.js';

export const PRIMARY_GROUPS: MenuItemGroup<CodeBlockToolbarContext>[] = [
  {
    type: 'primary',
    items: [
      {
        type: 'change-lang',
        generate: ({ blockComponent, setActive }) => {
          const state = { active: false };
          return {
            action: noop,
            render: () =>
              html`<language-list-button
                .blockComponent=${blockComponent}
                .onActiveStatusChange=${async (active: boolean) => {
                  state.active = active;
                  if (!active) {
                    await sleep(1000);
                    if (state.active) return;
                  }
                  setActive(active);
                }}
              >
              </language-list-button>`,
          };
        },
      },
      {
        type: 'preview',
        generate: ({ blockComponent }) => {
          return {
            action: noop,
            render: () => html`
              <preview-button .blockComponent=${blockComponent}>
              </preview-button>
            `,
          };
        },
      },
      {
        type: 'copy-code',
        label: 'Copy code',
        icon: CopyIcon,
        generate: ({ blockComponent }) => {
          return {
            action: () => {
              blockComponent.copyCode();
            },
            render: item => html`
              <editor-icon-button
                class="code-toolbar-button copy-code"
                aria-label=${ifDefined(item.label)}
                .tooltip=${item.label}
                .tooltipOffset=${4}
                .iconSize=${'16px'}
                .iconContainerPadding=${4}
                @click=${(e: MouseEvent) => {
                  e.stopPropagation();
                  item.action();
                }}
              >
                ${item.icon}
              </editor-icon-button>
            `,
          };
        },
      },
      {
        type: 'caption',
        label: 'Caption',
        icon: CaptionIcon,
        when: ({ doc }) => !doc.readonly,
        generate: ({ blockComponent }) => {
          return {
            action: () => {
              blockComponent.captionEditor?.show();
            },
            render: item => html`
              <editor-icon-button
                class="code-toolbar-button caption"
                aria-label=${ifDefined(item.label)}
                .tooltip=${item.label}
                .tooltipOffset=${4}
                .iconSize=${'16px'}
                .iconContainerPadding=${4}
                @click=${(e: MouseEvent) => {
                  e.stopPropagation();
                  item.action();
                }}
              >
                ${item.icon}
              </editor-icon-button>
            `,
          };
        },
      },
    ],
  },
];

// Clipboard Group
export const clipboardGroup: MenuItemGroup<CodeBlockToolbarContext> = {
  type: 'clipboard',
  items: [
    {
      type: 'wrap',
      generate: ({ blockComponent, close }) => {
        const wrapped = blockComponent.model.props.wrap;
        const label = wrapped ? 'Cancel wrap' : 'Wrap';
        const icon = wrapped ? CancelWrapIcon : WrapIcon;

        return {
          label,
          icon,
          action: () => {
            blockComponent.setWrap(!wrapped);
            close();
          },
        };
      },
    },
    {
      type: 'duplicate',
      label: 'Duplicate',
      icon: DuplicateIcon,
      when: ({ doc }) => !doc.readonly,
      action: ({ host, blockComponent, close }) => {
        const codeId = duplicateCodeBlock(blockComponent.model);

        host.updateComplete
          .then(() => {
            host.selection.setGroup('note', [
              host.selection.create(BlockSelection, {
                blockId: codeId,
              }),
            ]);

            if (isInsidePageEditor(host)) {
              const duplicateElement = host.view.getBlock(codeId);
              if (duplicateElement) {
                duplicateElement.scrollIntoView({ block: 'nearest' });
              }
            }
          })
          .catch(console.error);

        close();
      },
    },
  ],
};

// Delete Group
export const deleteGroup: MenuItemGroup<CodeBlockToolbarContext> = {
  type: 'delete',
  items: [
    {
      type: 'delete',
      label: 'Delete',
      icon: DeleteIcon,
      when: ({ doc }) => !doc.readonly,
      action: ({ doc, blockComponent, close }) => {
        doc.deleteBlock(blockComponent.model);
        close();
      },
    },
  ],
};

export const MORE_GROUPS: MenuItemGroup<CodeBlockToolbarContext>[] = [
  clipboardGroup,
  deleteGroup,
];
