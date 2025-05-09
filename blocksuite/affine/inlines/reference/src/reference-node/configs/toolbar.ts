import { notifyLinkedDocSwitchedToEmbed } from '@blocksuite/affine-components/notification';
import {
  ActionPlacement,
  DocDisplayMetaProvider,
  type ToolbarAction,
  type ToolbarActionGroup,
  type ToolbarModuleConfig,
} from '@blocksuite/affine-shared/services';
import {
  cloneReferenceInfoWithoutAliases,
  isInsideBlockByFlavour,
} from '@blocksuite/affine-shared/utils';
import { DeleteIcon } from '@blocksuite/icons/lit';
import { BlockSelection } from '@blocksuite/std';
import { signal } from '@preact/signals-core';
import { html } from 'lit-html';
import { keyed } from 'lit-html/directives/keyed.js';

import { AffineReference } from '../reference-node';

const trackBaseProps = {
  segment: 'doc',
  page: 'doc editor',
  module: 'toolbar',
  category: 'linked doc',
  type: 'inline view',
};

export const builtinInlineReferenceToolbarConfig = {
  actions: [
    {
      id: 'a.doc-title',
      content(ctx) {
        const target = ctx.message$.peek()?.element;
        if (!(target instanceof AffineReference)) return null;
        if (!target.referenceInfo.title) return null;

        const originalTitle =
          ctx.std.get(DocDisplayMetaProvider).title(target.referenceInfo.pageId)
            .value || 'Untitled';
        const open = (event: MouseEvent) => target.open({ event });

        return html`<affine-linked-doc-title
          .title=${originalTitle}
          .open=${open}
        ></affine-linked-doc-title>`;
      },
    },
    {
      id: 'c.conversions',
      actions: [
        {
          id: 'inline',
          label: 'Inline view',
          disabled: true,
        },
        {
          id: 'card',
          label: 'Card view',
          run(ctx) {
            const target = ctx.message$.peek()?.element;
            if (!(target instanceof AffineReference)) return;
            if (!target.block) return;

            const {
              block: { model },
              referenceInfo,
              inlineEditor,
              selfInlineRange,
            } = target;
            const { parent } = model;

            if (!inlineEditor || !selfInlineRange || !parent) return;

            // Clears
            ctx.reset();

            const index = parent.children.indexOf(model);

            const blockId = ctx.store.addBlock(
              'affine:embed-linked-doc',
              referenceInfo,
              parent,
              index + 1
            );

            const totalTextLength = inlineEditor.yTextLength;
            const inlineTextLength = selfInlineRange.length;
            if (totalTextLength === inlineTextLength) {
              ctx.store.deleteBlock(model);
            } else {
              inlineEditor.insertText(selfInlineRange, target.docTitle);
            }

            ctx.select('note', [
              ctx.selection.create(BlockSelection, { blockId }),
            ]);

            ctx.track('SelectedView', {
              ...trackBaseProps,
              control: 'select view',
              type: 'card view',
            });
          },
        },
        {
          id: 'embed',
          label: 'Embed view',
          disabled(ctx) {
            const target = ctx.message$.peek()?.element;
            if (!(target instanceof AffineReference)) return true;
            if (!target.block) return true;

            if (
              isInsideBlockByFlavour(
                ctx.store,
                target.block.model,
                'affine:edgeless-text'
              )
            )
              return true;

            // nesting is not supported
            if (target.closest('affine-embed-synced-doc-block')) return true;

            // same doc
            if (target.referenceInfo.pageId === ctx.store.id) return true;

            // linking to block
            if (target.referenceToNode()) return true;

            return false;
          },
          run(ctx) {
            const target = ctx.message$.peek()?.element;
            if (!(target instanceof AffineReference)) return;
            if (!target.block) return;

            const {
              block: { model },
              referenceInfo,
              inlineEditor,
              selfInlineRange,
            } = target;
            const { parent } = model;

            if (!inlineEditor || !selfInlineRange || !parent) return;

            // Clears
            ctx.reset();

            const index = parent.children.indexOf(model);

            const blockId = ctx.store.addBlock(
              'affine:embed-synced-doc',
              cloneReferenceInfoWithoutAliases(referenceInfo),
              parent,
              index + 1
            );

            const totalTextLength = inlineEditor.yTextLength;
            const inlineTextLength = selfInlineRange.length;
            if (totalTextLength === inlineTextLength) {
              ctx.store.deleteBlock(model);
            } else {
              inlineEditor.insertText(selfInlineRange, target.docTitle);
            }

            const hasTitleAlias = Boolean(referenceInfo.title);

            if (hasTitleAlias) {
              notifyLinkedDocSwitchedToEmbed(ctx.std);
            }

            ctx.select('note', [
              ctx.selection.create(BlockSelection, { blockId }),
            ]);

            ctx.track('SelectedView', {
              ...trackBaseProps,
              control: 'select view',
              type: 'embed view',
            });
          },
        },
      ],
      content(ctx) {
        const target = ctx.message$.peek()?.element;
        if (!(target instanceof AffineReference)) return null;

        const actions = this.actions.map(action => ({ ...action }));
        const viewType$ = signal(actions[0].label);
        const onToggle = (e: CustomEvent<boolean>) => {
          const opened = e.detail;
          if (!opened) return;

          ctx.track('OpenedViewSelector', {
            ...trackBaseProps,
            control: 'switch view',
          });
        };

        return html`${keyed(
          target,
          html`<affine-view-dropdown-menu
            .actions=${actions}
            .context=${ctx}
            .onToggle=${onToggle}
            .viewType$=${viewType$}
          ></affine-view-dropdown-menu>`
        )}`;
      },
      when(ctx) {
        const target = ctx.message$.peek()?.element;
        if (!(target instanceof AffineReference)) return false;
        if (!target.block) return false;

        if (ctx.flags.isNative()) return false;
        if (
          target.block.closest('affine-database') ||
          target.block.closest('affine-table')
        )
          return false;

        return true;
      },
    } satisfies ToolbarActionGroup<ToolbarAction>,
    {
      placement: ActionPlacement.More,
      id: 'c.delete',
      label: 'Delete',
      icon: DeleteIcon(),
      variant: 'destructive',
      run(ctx) {
        const target = ctx.message$.peek()?.element;
        if (!(target instanceof AffineReference)) return;

        const { inlineEditor, selfInlineRange } = target;
        if (!inlineEditor || !selfInlineRange) return;

        if (!inlineEditor.isValidInlineRange(selfInlineRange)) return;

        inlineEditor.deleteText(selfInlineRange);
      },
    },
  ],
} as const satisfies ToolbarModuleConfig;
