import { toast } from '@blocksuite/affine-components/toast';
import {
  ActionPlacement,
  EmbedIframeService,
  EmbedOptionProvider,
  type ToolbarAction,
  type ToolbarActionGroup,
  type ToolbarModuleConfig,
} from '@blocksuite/affine-shared/services';
import {
  CopyIcon,
  DeleteIcon,
  EditIcon,
  UnlinkIcon,
} from '@blocksuite/icons/lit';
import { BlockSelection } from '@blocksuite/std';
import { signal } from '@preact/signals-core';
import { html } from 'lit-html';
import { keyed } from 'lit-html/directives/keyed.js';

import { AffineLink } from '../affine-link';
import { toggleLinkPopup } from '../link-popup/toggle-link-popup';

const trackBaseProps = {
  segment: 'doc',
  page: 'doc editor',
  module: 'toolbar',
  category: 'link',
  type: 'inline view',
};

export const builtinInlineLinkToolbarConfig = {
  actions: [
    {
      id: 'a.preview',
      content(cx) {
        const target = cx.message$.peek()?.element;
        if (!(target instanceof AffineLink)) return null;

        const { link } = target;
        if (!link) return null;

        return html`<affine-link-preview .url=${link}></affine-link-preview>`;
      },
    },
    {
      id: 'b.copy-link-and-edit',
      actions: [
        {
          id: 'copy-link',
          tooltip: 'Copy link',
          icon: CopyIcon(),
          run(ctx) {
            const target = ctx.message$.peek()?.element;
            if (!(target instanceof AffineLink)) return;

            const { link } = target;

            if (!link) return;

            // Clears
            ctx.reset();

            navigator.clipboard.writeText(link).catch(console.error);
            toast(ctx.host, 'Copied link to clipboard');

            ctx.track('CopiedLink', {
              ...trackBaseProps,
              control: 'copy link',
            });
          },
        },
        {
          id: 'edit',
          tooltip: 'Edit Description',
          icon: EditIcon(),
          run(ctx) {
            const target = ctx.message$.peek()?.element;
            if (!(target instanceof AffineLink)) return;

            const { inlineEditor, selfInlineRange } = target;

            if (!inlineEditor || !selfInlineRange) return;

            const abortController = new AbortController();
            const popover = toggleLinkPopup(
              ctx.std,
              'edit',
              inlineEditor,
              selfInlineRange,
              abortController
            );
            abortController.signal.onabort = () => popover.remove();

            ctx.track('OpenedAliasPopup', {
              ...trackBaseProps,
              control: 'edit',
            });
          },
        },
      ],
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
            if (!(target instanceof AffineLink)) return;
            if (!target.block) return;

            const url = target.link;
            if (!url) return;

            const {
              block: { model },
              inlineEditor,
              selfInlineRange,
            } = target;
            const { parent } = model;

            if (!inlineEditor || !selfInlineRange || !parent) return;

            // Clears
            ctx.reset();

            const title = inlineEditor.yTextString.slice(
              selfInlineRange.index,
              selfInlineRange.index + selfInlineRange.length
            );

            const options = ctx.std
              .get(EmbedOptionProvider)
              .getEmbedBlockOptions(url);
            const flavour =
              options?.viewType === 'card'
                ? options.flavour
                : 'affine:bookmark';
            const index = parent.children.indexOf(model);
            const props = {
              url,
              title: title === url ? '' : title,
            };

            const blockId = ctx.store.addBlock(
              flavour,
              props,
              parent,
              index + 1
            );

            const totalTextLength = inlineEditor.yTextLength;
            const inlineTextLength = selfInlineRange.length;
            if (totalTextLength === inlineTextLength) {
              ctx.store.deleteBlock(model);
            } else {
              inlineEditor.formatText(selfInlineRange, { link: null });
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
          when(ctx) {
            const target = ctx.message$.peek()?.element;
            if (!(target instanceof AffineLink)) return false;
            if (!target.block) return false;

            const url = target.link;
            if (!url) return false;

            const {
              block: { model },
              inlineEditor,
              selfInlineRange,
            } = target;
            const { parent } = model;

            if (!inlineEditor || !selfInlineRange || !parent) return false;

            // check if the url can be embedded as iframe block
            const embedIframeService = ctx.std.get(EmbedIframeService);
            const canEmbedAsIframe = embedIframeService.canEmbed(url);

            const options = ctx.std
              .get(EmbedOptionProvider)
              .getEmbedBlockOptions(url);
            return canEmbedAsIframe || options?.viewType === 'embed';
          },
          run(ctx) {
            const target = ctx.message$.peek()?.element;
            if (!(target instanceof AffineLink)) return;
            if (!target.block) return;

            const url = target.link;
            if (!url) return;

            const {
              block: { model },
              inlineEditor,
              selfInlineRange,
            } = target;
            const { parent } = model;

            if (!inlineEditor || !selfInlineRange || !parent) return;

            // Clears
            ctx.reset();

            const index = parent.children.indexOf(model);
            const props = { url };
            let blockId: string | undefined;

            const embedIframeService = ctx.std.get(EmbedIframeService);
            const embedOptions = ctx.std
              .get(EmbedOptionProvider)
              .getEmbedBlockOptions(url);

            if (embedOptions?.viewType === 'embed') {
              const flavour = embedOptions.flavour;
              blockId = ctx.store.addBlock(flavour, props, parent, index + 1);
            } else if (embedIframeService.canEmbed(url)) {
              blockId = embedIframeService.addEmbedIframeBlock(
                props,
                parent.id,
                index + 1
              );
            }

            if (!blockId) return;

            const totalTextLength = inlineEditor.yTextLength;
            const inlineTextLength = selfInlineRange.length;
            if (totalTextLength === inlineTextLength) {
              ctx.store.deleteBlock(model);
            } else {
              inlineEditor.formatText(selfInlineRange, { link: null });
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
        if (!(target instanceof AffineLink)) return null;

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
        if (!(target instanceof AffineLink)) return false;
        if (!target.block) return false;

        if (ctx.flags.isNative()) return false;
        if (
          target.block.closest('affine-database') ||
          target.block.closest('affine-table')
        )
          return false;

        if (!target.link.startsWith('http')) return false;

        const { model } = target.block;
        const parent = model.parent;
        if (!parent) return false;

        const schema = ctx.store.schema;
        const bookmarkSchema = schema.flavourSchemaMap.get('affine:bookmark');
        if (!bookmarkSchema) return false;

        const parentSchema = schema.flavourSchemaMap.get(parent.flavour);
        if (!parentSchema) return false;

        try {
          schema.validateSchema(bookmarkSchema, parentSchema);
        } catch {
          return false;
        }

        return true;
      },
    } satisfies ToolbarActionGroup<ToolbarAction>,
    {
      placement: ActionPlacement.More,
      id: 'b.remove-link',
      label: 'Remove link',
      icon: UnlinkIcon(),
      run(ctx) {
        const target = ctx.message$.peek()?.element;
        if (!(target instanceof AffineLink)) return;

        const { inlineEditor, selfInlineRange } = target;
        if (!inlineEditor || !selfInlineRange) return;

        if (!inlineEditor.isValidInlineRange(selfInlineRange)) return;

        inlineEditor.formatText(selfInlineRange, { link: null });
      },
    },
    {
      placement: ActionPlacement.More,
      id: 'c.delete',
      label: 'Delete',
      icon: DeleteIcon(),
      variant: 'destructive',
      run(ctx) {
        const target = ctx.message$.peek()?.element;
        if (!(target instanceof AffineLink)) return;

        const { inlineEditor, selfInlineRange } = target;
        if (!inlineEditor || !selfInlineRange) return;

        if (!inlineEditor.isValidInlineRange(selfInlineRange)) return;

        inlineEditor.deleteText(selfInlineRange);
      },
    },
  ],
} as const satisfies ToolbarModuleConfig;
