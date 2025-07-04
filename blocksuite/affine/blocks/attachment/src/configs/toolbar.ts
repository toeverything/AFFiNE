import { createLitPortal } from '@blocksuite/affine-components/portal';
import {
  AttachmentBlockModel,
  defaultAttachmentProps,
  type EmbedCardStyle,
} from '@blocksuite/affine-model';
import {
  EMBED_CARD_HEIGHT,
  EMBED_CARD_WIDTH,
} from '@blocksuite/affine-shared/consts';
import {
  ActionPlacement,
  blockCommentToolbarButton,
  type ToolbarAction,
  type ToolbarActionGroup,
  type ToolbarModuleConfig,
  ToolbarModuleExtension,
} from '@blocksuite/affine-shared/services';
import { getBlockProps } from '@blocksuite/affine-shared/utils';
import { Bound } from '@blocksuite/global/gfx';
import {
  CaptionIcon,
  CopyIcon,
  DeleteIcon,
  DownloadIcon,
  DuplicateIcon,
  EditIcon,
  ReplaceIcon,
  ResetIcon,
} from '@blocksuite/icons/lit';
import { BlockFlavourIdentifier } from '@blocksuite/std';
import type { ExtensionType } from '@blocksuite/store';
import { flip, offset } from '@floating-ui/dom';
import { computed } from '@preact/signals-core';
import { html } from 'lit';
import { keyed } from 'lit/directives/keyed.js';

import { AttachmentBlockComponent } from '../attachment-block';
import { RenameModal } from '../components/rename-model';
import { AttachmentEmbedProvider } from '../embed';

const trackBaseProps = {
  category: 'attachment',
  type: 'card view',
};

export const attachmentViewDropdownMenu = {
  id: 'b.conversions',
  actions: [
    {
      id: 'card',
      label: 'Card view',
      run(ctx) {
        const model = ctx.getCurrentModelByType(AttachmentBlockModel);
        if (!model) return;

        const style = defaultAttachmentProps.style!;
        const width = EMBED_CARD_WIDTH[style];
        const height = EMBED_CARD_HEIGHT[style];
        const bounds = Bound.deserialize(model.xywh);
        bounds.w = width;
        bounds.h = height;

        ctx.store.updateBlock(model, {
          style,
          embed: false,
          xywh: bounds.serialize(),
        });
      },
    },
    {
      id: 'embed',
      label: 'Embed view',
      disabled: ctx => {
        const block = ctx.getCurrentBlockByType(AttachmentBlockComponent);
        return block ? !block.embedded() : true;
      },
      run(ctx) {
        const model = ctx.getCurrentModelByType(AttachmentBlockModel);
        if (!model) return;

        const provider = ctx.std.get(AttachmentEmbedProvider);

        // TODO(@fundon): should auto focus image block.
        if (
          provider.shouldBeConverted(model) &&
          !ctx.hasSelectedSurfaceModels
        ) {
          // Clears
          ctx.reset();
          ctx.select('note');
        }

        provider.convertTo(model);

        ctx.track('SelectedView', {
          ...trackBaseProps,
          control: 'select view',
          type: 'embed view',
        });
      },
    },
  ],
  content(ctx) {
    const block = ctx.getCurrentBlockByType(AttachmentBlockComponent);
    if (!block) return null;

    const model = block.model;
    const embedProvider = ctx.std.get(AttachmentEmbedProvider);
    const actions = computed(() => {
      const [cardAction, embedAction] = this.actions.map(action => ({
        ...action,
      }));

      const ok = block.resourceController.resolvedState$.value.state === 'none';
      const sourceId = Boolean(model.props.sourceId$.value);
      const embed = model.props.embed$.value ?? false;
      // 1. Check whether `sourceId` exists.
      // 2. Check if `embedded` is allowed.
      // 3. Check `blobState$`
      const allowed = ok && sourceId && embedProvider.embedded(model) && !embed;

      cardAction.disabled = !embed;
      embedAction.disabled = !allowed;

      return [cardAction, embedAction];
    });
    const viewType$ = computed(() => {
      const [cardAction, embedAction] = actions.value;
      const embed = model.props.embed$.value ?? false;
      return embed ? embedAction.label : cardAction.label;
    });
    const onToggle = (e: CustomEvent<boolean>) => {
      e.stopPropagation();
      const opened = e.detail;
      if (!opened) return;

      ctx.track('OpenedViewSelector', {
        ...trackBaseProps,
        control: 'switch view',
      });
    };

    return html`<affine-view-dropdown-menu
      @toggle=${onToggle}
      .actions=${actions.value}
      .context=${ctx}
      .viewType$=${viewType$}
    ></affine-view-dropdown-menu>`;
  },
} as const satisfies ToolbarActionGroup<ToolbarAction>;

const replaceAction = {
  id: 'c.replace',
  tooltip: 'Replace attachment',
  icon: ReplaceIcon(),
  disabled(ctx) {
    const block = ctx.getCurrentBlockByType(AttachmentBlockComponent);
    if (!block) return true;

    const { downloading = false, uploading = false } =
      block.resourceController.state$.value;
    return downloading || uploading;
  },
  run(ctx) {
    const block = ctx.getCurrentBlockByType(AttachmentBlockComponent);
    block?.replace().catch(console.error);
  },
} as const satisfies ToolbarAction;

const downloadAction = {
  id: 'd.download',
  tooltip: 'Download',
  icon: DownloadIcon(),
  run(ctx) {
    const block = ctx.getCurrentBlockByType(AttachmentBlockComponent);
    block?.download();
  },
  when(ctx) {
    const model = ctx.getCurrentModelByType(AttachmentBlockModel);
    if (!model) return false;
    // Current citation attachment block does not support download
    return model.props.style !== 'citation' && !model.props.footnoteIdentifier;
  },
} as const satisfies ToolbarAction;

const captionAction = {
  id: 'e.caption',
  tooltip: 'Caption',
  icon: CaptionIcon(),
  run(ctx) {
    const block = ctx.getCurrentBlockByType(AttachmentBlockComponent);
    block?.captionEditor?.show();

    ctx.track('OpenedCaptionEditor', {
      ...trackBaseProps,
      control: 'add caption',
    });
  },
} as const satisfies ToolbarAction;

const builtinToolbarConfig = {
  actions: [
    {
      id: 'a.rename',
      content(ctx) {
        const block = ctx.getCurrentBlockByType(AttachmentBlockComponent);
        if (!block) return null;

        const abortController = new AbortController();
        abortController.signal.onabort = () => ctx.show();

        return html`
          <editor-icon-button
            aria-label="Rename"
            .tooltip="${'Rename'}"
            @click=${() => {
              ctx.hide();

              createLitPortal({
                template: RenameModal({
                  model: block.model,
                  editorHost: ctx.host,
                  abortController,
                }),
                computePosition: {
                  referenceElement: block,
                  placement: 'top-start',
                  middleware: [flip(), offset(4)],
                },
                abortController,
              });
            }}
          >
            ${EditIcon()}
          </editor-icon-button>
        `;
      },
    },
    attachmentViewDropdownMenu,
    replaceAction,
    downloadAction,
    captionAction,
    {
      id: 'f.comment',
      ...blockCommentToolbarButton,
    },
    {
      placement: ActionPlacement.More,
      id: 'a.clipboard',
      actions: [
        {
          id: 'copy',
          label: 'Copy',
          icon: CopyIcon(),
          run(ctx) {
            // TODO(@fundon): unify `clone` method
            const block = ctx.getCurrentBlockByType(AttachmentBlockComponent);
            block?.copy();
          },
        },
        {
          id: 'duplicate',
          label: 'Duplicate',
          icon: DuplicateIcon(),
          run(ctx) {
            const model = ctx.getCurrentModelByType(AttachmentBlockModel);
            if (!model) return;

            // TODO(@fundon): unify `duplicate` method
            ctx.store.addSiblingBlocks(model, [
              {
                flavour: model.flavour,
                ...getBlockProps(model),
              },
            ]);
          },
        },
      ],
    },
    {
      placement: ActionPlacement.More,
      id: 'b.refresh',
      label: 'Reload',
      icon: ResetIcon(),
      run(ctx) {
        const block = ctx.getCurrentBlockByType(AttachmentBlockComponent);
        block?.reload();

        ctx.track('AttachmentReloadedEvent', {
          ...trackBaseProps,
          control: 'reload',
          type: block?.model.props.name.split('.').pop() ?? '',
        });
      },
    },
    {
      placement: ActionPlacement.More,
      id: 'c.delete',
      label: 'Delete',
      icon: DeleteIcon(),
      variant: 'destructive',
      run(ctx) {
        const model = ctx.getCurrentModel();
        if (!model) return;

        ctx.store.deleteBlock(model.id);

        // Clears
        ctx.select('note');
        ctx.reset();
      },
    },
  ],
} as const satisfies ToolbarModuleConfig;

const builtinSurfaceToolbarConfig = {
  actions: [
    attachmentViewDropdownMenu,
    {
      id: 'c.style',
      actions: [
        {
          id: 'horizontalThin',
          label: 'Horizontal style',
        },
        {
          id: 'cubeThick',
          label: 'Vertical style',
        },
      ],
      content(ctx) {
        const model = ctx.getCurrentModelByType(AttachmentBlockModel);
        if (!model) return null;

        const actions = this.actions.map(action => ({
          ...action,
          run: ({ store }) => {
            const style = action.id as EmbedCardStyle;
            const bounds = Bound.deserialize(model.xywh);
            bounds.w = EMBED_CARD_WIDTH[style];
            bounds.h = EMBED_CARD_HEIGHT[style];
            const xywh = bounds.serialize();

            store.updateBlock(model, { style, xywh });

            ctx.track('SelectedCardStyle', {
              ...trackBaseProps,
              page: 'whiteboard editor',
              control: 'select card style',
              type: style,
            });
          },
        })) satisfies ToolbarAction[];
        const style$ = model.props.style$;
        const onToggle = (e: CustomEvent<boolean>) => {
          e.stopPropagation();
          const opened = e.detail;
          if (!opened) return;

          ctx.track('OpenedCardStyleSelector', {
            ...trackBaseProps,
            page: 'whiteboard editor',
            control: 'switch card style',
          });
        };

        return html`${keyed(
          model,
          html`<affine-card-style-dropdown-menu
            @toggle=${onToggle}
            .actions=${actions}
            .context=${ctx}
            .style$=${style$}
          ></affine-card-style-dropdown-menu>`
        )}`;
      },
    } satisfies ToolbarActionGroup<ToolbarAction>,
    {
      ...replaceAction,
      id: 'd.replace',
    },
    {
      ...downloadAction,
      id: 'e.download',
    },
    {
      ...captionAction,
      id: 'f.caption',
    },
  ],
  when: ctx => ctx.getSurfaceModelsByType(AttachmentBlockModel).length === 1,
} as const satisfies ToolbarModuleConfig;

export const createBuiltinToolbarConfigExtension = (
  flavour: string
): ExtensionType[] => {
  const name = flavour.split(':').pop();

  return [
    ToolbarModuleExtension({
      id: BlockFlavourIdentifier(flavour),
      config: builtinToolbarConfig,
    }),

    ToolbarModuleExtension({
      id: BlockFlavourIdentifier(`affine:surface:${name}`),
      config: builtinSurfaceToolbarConfig,
    }),
  ];
};
