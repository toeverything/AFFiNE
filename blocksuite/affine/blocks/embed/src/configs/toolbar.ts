import { reassociateConnectorsCommand } from '@blocksuite/affine-block-surface';
import { toast } from '@blocksuite/affine-components/toast';
import {
  BookmarkStyles,
  type EmbedCardStyle,
  EmbedGithubModel,
  EmbedGithubStyles,
  isExternalEmbedModel,
} from '@blocksuite/affine-model';
import {
  EMBED_CARD_HEIGHT,
  EMBED_CARD_WIDTH,
} from '@blocksuite/affine-shared/consts';
import {
  ActionPlacement,
  blockCommentToolbarButton,
  EmbedOptionProvider,
  type LinkEventType,
  type ToolbarAction,
  type ToolbarActionGroup,
  type ToolbarContext,
  type ToolbarModuleConfig,
  ToolbarModuleExtension,
} from '@blocksuite/affine-shared/services';
import { getBlockProps } from '@blocksuite/affine-shared/utils';
import { Bound } from '@blocksuite/global/gfx';
import {
  CaptionIcon,
  CopyIcon,
  DeleteIcon,
  DuplicateIcon,
  ResetIcon,
} from '@blocksuite/icons/lit';
import { BlockFlavourIdentifier, BlockSelection } from '@blocksuite/std';
import { type ExtensionType, Slice, Text } from '@blocksuite/store';
import { computed, signal } from '@preact/signals-core';
import { html } from 'lit';
import { keyed } from 'lit/directives/keyed.js';
import * as Y from 'yjs';

import type { EmbedFigmaBlockComponent } from '../embed-figma-block';
import type { EmbedGithubBlockComponent } from '../embed-github-block';
import type { EmbedLoomBlockComponent } from '../embed-loom-block';
import type { EmbedYoutubeBlockComponent } from '../embed-youtube-block';

const trackBaseProps = {
  category: 'link',
  type: 'card view',
};

const previewAction = {
  id: 'a.preview',
  content(ctx) {
    const model = ctx.getCurrentModel();
    if (!model || !isExternalEmbedModel(model)) return null;

    const { url } = model.props;
    const options = ctx.std.get(EmbedOptionProvider).getEmbedBlockOptions(url);

    if (options?.viewType !== 'card') return null;

    return html`<affine-link-preview .url=${url}></affine-link-preview>`;
  },
} satisfies ToolbarAction;

const createOnToggleFn =
  (
    ctx: ToolbarContext,
    name: Extract<
      LinkEventType,
      | 'OpenedViewSelector'
      | 'OpenedCardStyleSelector'
      | 'OpenedCardScaleSelector'
    >,
    control: 'switch view' | 'switch card style' | 'switch card scale'
  ) =>
  (e: CustomEvent<boolean>) => {
    e.stopPropagation();
    const opened = e.detail;
    if (!opened) return;

    ctx.track(name, { ...trackBaseProps, control });
  };

// External embed blocks
function createBuiltinToolbarConfigForExternal(
  klass:
    | typeof EmbedGithubBlockComponent
    | typeof EmbedFigmaBlockComponent
    | typeof EmbedLoomBlockComponent
    | typeof EmbedYoutubeBlockComponent
) {
  return {
    actions: [
      previewAction,
      {
        id: 'b.conversions',
        actions: [
          {
            id: 'inline',
            label: 'Inline view',
            run(ctx) {
              const model = ctx.getCurrentModel();
              if (!model || !isExternalEmbedModel(model)) return;

              const { title, caption, url: link } = model.props;
              const { parent } = model;
              const index = parent?.children.indexOf(model);

              const yText = new Y.Text();
              const insert = title || caption || link;
              yText.insert(0, insert);
              yText.format(0, insert.length, { link });

              const text = new Text(yText);

              ctx.store.addBlock('affine:paragraph', { text }, parent, index);

              ctx.store.deleteBlock(model);

              // Clears
              ctx.select('note');
              ctx.reset();

              ctx.track('SelectedView', {
                ...trackBaseProps,
                control: 'select view',
                type: 'inline view',
              });
            },
          },
          {
            id: 'card',
            label: 'Card view',
            disabled(ctx) {
              const model = ctx.getCurrentModel();
              if (!model || !isExternalEmbedModel(model)) return true;

              const { url } = model.props;
              const options = ctx.std
                .get(EmbedOptionProvider)
                .getEmbedBlockOptions(url);

              return options?.viewType === 'card';
            },
            run(ctx) {
              const model = ctx.getCurrentModel();
              if (!model || !isExternalEmbedModel(model)) return;

              const { url, caption } = model.props;
              const { parent } = model;
              const index = parent?.children.indexOf(model);
              const options = ctx.std
                .get(EmbedOptionProvider)
                .getEmbedBlockOptions(url);

              let style: EmbedCardStyle = model.props.style;
              let flavour = 'affine:bookmark';

              if (options?.viewType === 'card') {
                flavour = options.flavour;
                if (!options.styles.includes(style)) {
                  style = options.styles[0];
                }
              } else {
                style =
                  BookmarkStyles.find(s => s !== 'vertical' && s !== 'cube') ??
                  BookmarkStyles[1];
              }

              const blockId = ctx.store.addBlock(
                flavour,
                { url, caption, style },
                parent,
                index
              );

              ctx.store.deleteBlock(model);

              // Selects new block
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
              const model = ctx.getCurrentModel();
              if (!model || !isExternalEmbedModel(model)) return false;

              const { url } = model.props;
              const options = ctx.std
                .get(EmbedOptionProvider)
                .getEmbedBlockOptions(url);

              return options?.viewType === 'embed';
            },
            when(ctx) {
              const model = ctx.getCurrentModel();
              if (!model || !isExternalEmbedModel(model)) return false;

              const { url } = model.props;
              const options = ctx.std
                .get(EmbedOptionProvider)
                .getEmbedBlockOptions(url);

              return options?.viewType === 'embed';
            },
            run(ctx) {
              const model = ctx.getCurrentModel();
              if (!model || !isExternalEmbedModel(model)) return;

              const { url, caption } = model.props;
              const { parent } = model;
              const index = parent?.children.indexOf(model);
              const options = ctx.std
                .get(EmbedOptionProvider)
                .getEmbedBlockOptions(url);

              if (options?.viewType !== 'embed') return;

              const { flavour, styles } = options;
              let style: EmbedCardStyle = model.props.style;

              if (!styles.includes(style)) {
                style =
                  styles.find(s => s !== 'vertical' && s !== 'cube') ??
                  styles[0];
              }

              const blockId = ctx.store.addBlock(
                flavour,
                { url, caption, style },
                parent,
                index
              );

              ctx.store.deleteBlock(model);

              // Selects new block
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
          const model = ctx.getCurrentModel();
          if (!model || !isExternalEmbedModel(model)) return null;

          const { url } = model.props;
          const viewType =
            ctx.std.get(EmbedOptionProvider).getEmbedBlockOptions(url)
              ?.viewType ?? 'card';
          const actions = this.actions.map(action => ({ ...action }));
          const viewType$ = signal(
            `${viewType === 'card' ? 'Card' : 'Embed'} view`
          );
          const onToggle = createOnToggleFn(
            ctx,
            'OpenedViewSelector',
            'switch view'
          );

          return html`${keyed(
            model,
            html`<affine-view-dropdown-menu
              @toggle=${onToggle}
              .actions=${actions}
              .context=${ctx}
              .viewType$=${viewType$}
            ></affine-view-dropdown-menu>`
          )}`;
        },
      } satisfies ToolbarActionGroup<ToolbarAction>,
      {
        id: 'c.style',
        actions: [
          {
            id: 'horizontal',
            label: 'Large horizontal style',
          },
          {
            id: 'list',
            label: 'Small horizontal style',
          },
        ],
        when(ctx) {
          return Boolean(ctx.getCurrentModelByType(EmbedGithubModel));
        },
        content(ctx) {
          const model = ctx.getCurrentModelByType(EmbedGithubModel);
          if (!model) return null;

          const actions = this.actions.map(action => ({
            ...action,
            run: ({ store }) => {
              store.updateBlock(model, { style: action.id });

              ctx.track('SelectedCardStyle', {
                ...trackBaseProps,
                control: 'select card style',
                type: action.id,
              });
            },
          })) satisfies ToolbarAction[];
          const onToggle = createOnToggleFn(
            ctx,
            'OpenedCardStyleSelector',
            'switch card style'
          );

          return html`${keyed(
            model,
            html`<affine-card-style-dropdown-menu
              @toggle=${onToggle}
              .actions=${actions}
              .context=${ctx}
              .style$=${model.props.style$}
            ></affine-card-style-dropdown-menu>`
          )}`;
        },
      } satisfies ToolbarActionGroup<ToolbarAction>,
      {
        id: 'd.caption',
        tooltip: 'Caption',
        icon: CaptionIcon(),
        run(ctx) {
          const block = ctx.getCurrentBlockByType(klass);
          block?.captionEditor?.show();

          ctx.track('OpenedCaptionEditor', {
            ...trackBaseProps,
            control: 'add caption',
          });
        },
      },
      {
        id: 'e.comment',
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
              const model = ctx.getCurrentBlockByType(klass)?.model;
              if (!model || !isExternalEmbedModel(model)) return;

              const slice = Slice.fromModels(ctx.store, [model]);
              ctx.clipboard
                .copySlice(slice)
                .then(() => toast(ctx.host, 'Copied to clipboard'))
                .catch(console.error);
            },
          },
          {
            id: 'duplicate',
            label: 'Duplicate',
            icon: DuplicateIcon(),
            run(ctx) {
              const model = ctx.getCurrentBlockByType(klass)?.model;
              if (!model || !isExternalEmbedModel(model)) return;

              const { flavour, parent } = model;
              const props = getBlockProps(model);
              const index = parent?.children.indexOf(model);

              ctx.store.addBlock(flavour, props, parent, index);
            },
          },
        ],
      },
      {
        placement: ActionPlacement.More,
        id: 'b.reload',
        label: 'Reload',
        icon: ResetIcon(),
        run(ctx) {
          const block = ctx.getCurrentBlockByType(klass);
          block?.refreshData();
        },
      },
      {
        placement: ActionPlacement.More,
        id: 'c.delete',
        label: 'Delete',
        icon: DeleteIcon(),
        variant: 'destructive',
        run(ctx) {
          const model = ctx.getCurrentBlockByType(klass)?.model;
          if (!model || !isExternalEmbedModel(model)) return;

          ctx.store.deleteBlock(model.id);

          // Clears
          ctx.select('note');
          ctx.reset();
        },
      },
    ],
  } as const satisfies ToolbarModuleConfig;
}

const createBuiltinSurfaceToolbarConfigForExternal = (
  klass:
    | typeof EmbedGithubBlockComponent
    | typeof EmbedFigmaBlockComponent
    | typeof EmbedLoomBlockComponent
    | typeof EmbedYoutubeBlockComponent
) => {
  return {
    actions: [
      previewAction,
      {
        id: 'b.conversions',
        actions: [
          {
            id: 'card',
            label: 'Card view',
            run(ctx) {
              const model = ctx.getCurrentBlockByType(klass)?.model;
              if (!model || !isExternalEmbedModel(model)) return;

              const { id: oldId, xywh, parent } = model;
              const { url, caption } = model.props;

              let { style } = model.props;
              let flavour = 'affine:bookmark';

              if (
                !BookmarkStyles.includes(
                  style as (typeof BookmarkStyles)[number]
                )
              ) {
                style = BookmarkStyles[0];
              }

              const bounds = Bound.deserialize(xywh);
              bounds.w = EMBED_CARD_WIDTH[style];
              bounds.h = EMBED_CARD_HEIGHT[style];

              const newId = ctx.store.addBlock(
                flavour,
                { url, caption, style, xywh: bounds.serialize() },
                parent
              );

              ctx.command.exec(reassociateConnectorsCommand, { oldId, newId });

              ctx.store.deleteBlock(model);

              // Selects new block
              ctx.gfx.selection.set({ editing: false, elements: [newId] });

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
            disabled: true,
          },
        ],
        when(ctx) {
          const model = ctx.getCurrentBlockByType(klass)?.model;
          if (!model || !isExternalEmbedModel(model)) return false;

          const { url } = model.props;
          const options = ctx.std
            .get(EmbedOptionProvider)
            .getEmbedBlockOptions(url);

          return options?.viewType === 'embed';
        },
        content(ctx) {
          const model = ctx.getCurrentBlockByType(klass)?.model;
          if (!model || !isExternalEmbedModel(model)) return null;

          const { url } = model.props;
          const viewType =
            ctx.std.get(EmbedOptionProvider).getEmbedBlockOptions(url)
              ?.viewType ?? 'card';
          const actions = this.actions.map(action => ({ ...action }));
          const viewType$ = signal(
            `${viewType === 'card' ? 'Card' : 'Embed'} view`
          );
          const onToggle = createOnToggleFn(
            ctx,
            'OpenedViewSelector',
            'switch view'
          );

          return html`${keyed(
            model,
            html`<affine-view-dropdown-menu
              @toggle=${onToggle}
              .actions=${actions}
              .context=${ctx}
              .viewType$=${viewType$}
            ></affine-view-dropdown-menu>`
          )}`;
        },
      } satisfies ToolbarActionGroup<ToolbarAction>,
      {
        id: 'c.style',
        actions: (
          [
            {
              id: 'horizontal',
              label: 'Large horizontal style',
            },
            {
              id: 'list',
              label: 'Small horizontal style',
            },
            {
              id: 'vertical',
              label: 'Large vertical style',
            },
            {
              id: 'cube',
              label: 'Small vertical style',
            },
          ] as const
        ).filter(action => EmbedGithubStyles.includes(action.id)),
        when(ctx) {
          return Boolean(ctx.getCurrentModelByType(EmbedGithubModel));
        },
        content(ctx) {
          const model = ctx.getCurrentBlockByType(klass)?.model;
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
                control: 'select card style',
                type: style,
              });
            },
          })) satisfies ToolbarAction[];
          const style$ = model.props.style$;
          const onToggle = createOnToggleFn(
            ctx,
            'OpenedCardStyleSelector',
            'switch card style'
          );

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
        id: 'd.caption',
        tooltip: 'Caption',
        icon: CaptionIcon(),
        run(ctx) {
          const block = ctx.getCurrentBlockByType(klass);
          block?.captionEditor?.show();

          ctx.track('OpenedCaptionEditor', {
            ...trackBaseProps,
            control: 'add caption',
          });
        },
      },
      {
        id: 'e.scale',
        content(ctx) {
          const model = ctx.getCurrentBlockByType(klass)?.model;
          if (!model) return null;

          const scale$ = computed(() => {
            const {
              xywh$: { value: xywh },
            } = model;
            const {
              style$: { value: style },
            } = model.props;
            const bounds = Bound.deserialize(xywh);
            const height = EMBED_CARD_HEIGHT[style];
            return Math.round(100 * (bounds.h / height));
          });
          const onSelect = (e: CustomEvent<number>) => {
            e.stopPropagation();

            const scale = e.detail / 100;

            const bounds = Bound.deserialize(model.xywh);
            const style = model.props.style;
            bounds.h = EMBED_CARD_HEIGHT[style] * scale;
            bounds.w = EMBED_CARD_WIDTH[style] * scale;
            const xywh = bounds.serialize();

            ctx.store.updateBlock(model, { xywh });

            ctx.track('SelectedCardScale', {
              ...trackBaseProps,
              control: 'select card scale',
            });
          };
          const onToggle = createOnToggleFn(
            ctx,
            'OpenedCardScaleSelector',
            'switch card scale'
          );
          const format = (value: number) => `${value}%`;

          return html`${keyed(
            model,
            html`<affine-size-dropdown-menu
              @select=${onSelect}
              @toggle=${onToggle}
              .format=${format}
              .size$=${scale$}
            ></affine-size-dropdown-menu>`
          )}`;
        },
      },
    ],

    when: ctx => ctx.getSurfaceBlocksByType(klass).length === 1,
  } as const satisfies ToolbarModuleConfig;
};

export const createBuiltinToolbarConfigExtension = (
  flavour: string,
  klass:
    | typeof EmbedGithubBlockComponent
    | typeof EmbedFigmaBlockComponent
    | typeof EmbedLoomBlockComponent
    | typeof EmbedYoutubeBlockComponent
): ExtensionType[] => {
  const name = flavour.split(':').pop();

  return [
    ToolbarModuleExtension({
      id: BlockFlavourIdentifier(flavour),
      config: createBuiltinToolbarConfigForExternal(klass),
    }),

    ToolbarModuleExtension({
      id: BlockFlavourIdentifier(`affine:surface:${name}`),
      config: createBuiltinSurfaceToolbarConfigForExternal(klass),
    }),
  ];
};
