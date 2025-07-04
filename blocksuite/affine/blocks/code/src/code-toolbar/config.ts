import {
  CancelWrapIcon,
  CaptionIcon,
  CopyIcon,
  DeleteIcon,
  DuplicateIcon,
  WrapIcon,
} from '@blocksuite/affine-components/icons';
import type { MenuItemGroup } from '@blocksuite/affine-components/toolbar';
import { CommentProviderIdentifier } from '@blocksuite/affine-shared/services';
import { isInsidePageEditor } from '@blocksuite/affine-shared/utils';
import { noop, sleep } from '@blocksuite/global/utils';
import { CommentIcon, NumberedListIcon } from '@blocksuite/icons/lit';
import { BlockSelection } from '@blocksuite/std';
import { html } from 'lit';
import { ifDefined } from 'lit/directives/if-defined.js';

import { CodeBlockConfigExtension } from '../code-block-config.js';
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
      {
        type: 'comment',
        label: 'Comment',
        tooltip: 'Comment',
        icon: CommentIcon({
          width: '20',
          height: '20',
        }),
        when: ({ std }) => !!std.getOptional(CommentProviderIdentifier),
        generate: ({ blockComponent }) => {
          return {
            action: () => {
              const commentProvider = blockComponent.std.getOptional(
                CommentProviderIdentifier
              );
              if (!commentProvider) return;

              commentProvider.addComment([
                new BlockSelection({
                  blockId: blockComponent.model.id,
                }),
              ]);
            },
            render: item =>
              html`<editor-icon-button
                class="code-toolbar-button comment"
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
              </editor-icon-button>`,
          };
        },
      },
    ],
  },
];

export const toggleGroup: MenuItemGroup<CodeBlockToolbarContext> = {
  type: 'toggle',
  items: [
    {
      type: 'wrap',
      generate: ({ blockComponent }) => {
        return {
          action: () => {},
          render: () => {
            const wrapped = blockComponent.model.props.wrap;
            const label = wrapped ? 'Cancel wrap' : 'Wrap';
            const icon = wrapped ? CancelWrapIcon : WrapIcon;
            return html`
              <editor-menu-action
                @click=${() => {
                  blockComponent.setWrap(!wrapped);
                }}
                aria-label=${label}
              >
                ${icon}
                <span class="label">${label}</span>
                <toggle-switch
                  style="margin-left: auto;"
                  .on="${wrapped}"
                ></toggle-switch>
              </editor-menu-action>
            `;
          },
        };
      },
    },
    {
      type: 'line-number',
      when: ({ std }) =>
        std.getOptional(CodeBlockConfigExtension.identifier)?.showLineNumbers ??
        true,
      generate: ({ blockComponent }) => {
        return {
          action: () => {},
          render: () => {
            const lineNumber = blockComponent.model.props.lineNumber ?? true;
            const label = lineNumber ? 'Cancel line number' : 'Line number';
            return html`
              <editor-menu-action
                @click=${() => {
                  blockComponent.store.updateBlock(blockComponent.model, {
                    lineNumber: !lineNumber,
                  });
                }}
                aria-label=${label}
              >
                ${NumberedListIcon()}
                <span class="label">${label}</span>
                <toggle-switch
                  style="margin-left: auto;"
                  .on="${lineNumber}"
                ></toggle-switch>
              </editor-menu-action>
            `;
          },
        };
      },
    },
  ],
};

// Clipboard Group
export const clipboardGroup: MenuItemGroup<CodeBlockToolbarContext> = {
  type: 'clipboard',
  items: [
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
  toggleGroup,
  clipboardGroup,
  deleteGroup,
];
