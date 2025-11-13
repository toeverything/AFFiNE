import {
  canEmbedAsEmbedBlock,
  canEmbedAsIframe,
  EMBED_IFRAME_DEFAULT_HEIGHT_IN_SURFACE,
  EMBED_IFRAME_DEFAULT_WIDTH_IN_SURFACE,
} from '@blocksuite/affine-block-embed';
import { reassociateConnectorsCommand } from '@blocksuite/affine-block-surface';
import { toast } from '@blocksuite/affine-components/toast';
import {
  BookmarkBlockModel,
  BookmarkStyles,
  type EmbedCardStyle,
} from '@blocksuite/affine-model';
import {
  EMBED_CARD_HEIGHT,
  EMBED_CARD_WIDTH,
} from '@blocksuite/affine-shared/consts';
import {
  ActionPlacement,
  EmbedIframeService,
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

import { BookmarkBlockComponent } from '../bookmark-block';

const trackBaseProps = {
  category: 'bookmark',
  type: 'card view',
};

const previewAction = {
  id: 'a.preview',
  content(ctx) {
    const model = ctx.getCurrentModelByType(BookmarkBlockModel);
    if (!model) return null;

    const { url } = model.props;

    return html`<affine-link-preview .url=${url}></affine-link-preview>`;
  },
} satisfies ToolbarAction;

const captionAction = {
  id: 'd.caption',
  tooltip: 'Caption',
  icon: CaptionIcon(),
  run(ctx) {
    const block = ctx.getCurrentBlockByType(BookmarkBlockComponent);
    block?.captionEditor?.show();

    ctx.track('OpenedCaptionEditor', {
      ...trackBaseProps,
      control: 'add caption',
    });
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
    control: string
  ) =>
  (e: CustomEvent<boolean>) => {
    e.stopPropagation();
    const opened = e.detail;
    if (!opened) return;

    ctx.track(name, {
      ...trackBaseProps,
      control,
    });
  };

const builtinToolbarConfig = {
  actions: [
    previewAction,
    {
      id: 'b.conversions',
      actions: [
        {
          id: 'inline',
          label: 'Inline view',
          run(ctx) {
            const model = ctx.getCurrentModelByType(BookmarkBlockModel);
            if (!model) return;

            const { title, caption, url } = model.props;
            const { parent } = model;
            const index = parent?.children.indexOf(model);

            const yText = new Y.Text();
            const insert = title || caption || url;
            yText.insert(0, insert);
            yText.format(0, insert.length, { link: url });

            const text = new Text(yText);

            ctx.store.addBlock('affine:paragraph', { text }, parent, index);

            ctx.store.deleteBlock(model);

            // Clears
            ctx.reset();
            ctx.select('note');

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
          disabled: true,
        },
        {
          id: 'embed',
          label: 'Embed view',
          disabled(ctx) {
            const model = ctx.getCurrentModelByType(BookmarkBlockModel);
            if (!model) return true;

            const url = model.props.url;

            return (
              !canEmbedAsIframe(ctx.std, url) &&
              !canEmbedAsEmbedBlock(ctx.std, url)
            );
          },
          run(ctx) {
            const model = ctx.getCurrentModelByType(BookmarkBlockModel);
            if (!model) return;

            const { caption, url, title, description, style } = model.props;
            const { parent } = model;
            const index = parent?.children.indexOf(model);
            if (!parent) return;

            let blockId: string | undefined;

            // first try to embed as a custom embed block
            if (canEmbedAsEmbedBlock(ctx.std, url)) {
              const options = ctx.std
                .get(EmbedOptionProvider)
                .getEmbedBlockOptions(url);

              if (!options) return;

              const { flavour, styles } = options;

              const newStyle = styles.includes(style)
                ? style
                : styles.find(s => s !== 'vertical' && s !== 'cube');

              blockId = ctx.store.addBlock(
                flavour,
                {
                  url,
                  caption,
                  title,
                  description,
                  style: newStyle,
                },
                parent,
                index
              );
            } else if (canEmbedAsIframe(ctx.std, url)) {
              const embedIframeService = ctx.std.get(EmbedIframeService);
              blockId = embedIframeService.addEmbedIframeBlock(
                { url, caption, title, description },
                parent.id,
                index
              );
            }

            if (!blockId) return;

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
        const model = ctx.getCurrentModelByType(BookmarkBlockModel);
        if (!model) return null;

        const actions = this.actions.map(action => ({ ...action }));
        const viewType$ = signal(actions[1].label);
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
      content(ctx) {
        const model = ctx.getCurrentModelByType(BookmarkBlockModel);
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
    captionAction,
    {
      placement: ActionPlacement.More,
      id: 'a.clipboard',
      actions: [
        {
          id: 'copy',
          label: 'Copy',
          icon: CopyIcon(),
          run(ctx) {
            const model = ctx.getCurrentModelByType(BookmarkBlockModel);
            if (!model) return;

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
            const model = ctx.getCurrentModelByType(BookmarkBlockModel);
            if (!model) return;

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
      id: 'b.refresh',
      label: 'Reload',
      icon: ResetIcon(),
      run(ctx) {
        const block = ctx.getCurrentBlockByType(BookmarkBlockComponent);
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
        const model = ctx.getCurrentModelByType(BookmarkBlockModel);
        if (!model) return;

        ctx.store.deleteBlock(model);

        // Clears
        ctx.select('note');
        ctx.reset();
      },
    },
  ],
} as const satisfies ToolbarModuleConfig;

const builtinSurfaceToolbarConfig = {
  actions: [
    previewAction,
    {
      id: 'b.conversions',
      actions: [
        {
          id: 'card',
          label: 'Card view',
          disabled: true,
        },
        {
          id: 'embed',
          label: 'Embed view',
          run(ctx) {
            const model = ctx.getCurrentModelByType(BookmarkBlockModel);
            if (!model) return;

            const { id: oldId, xywh, parent } = model;
            const { url, caption, title, description } = model.props;

            let newId: string | undefined;

            // first try to embed as a custom embed block
            if (canEmbedAsEmbedBlock(ctx.std, url)) {
              const options = ctx.std
                .get(EmbedOptionProvider)
                .getEmbedBlockOptions(url);

              if (options?.viewType !== 'embed') return;

              const { flavour, styles } = options;
              let style: EmbedCardStyle = model.props.style;

              if (!styles.includes(style)) {
                style = styles[0];
              }

              const bound = Bound.deserialize(xywh);
              bound.w = EMBED_CARD_WIDTH[style];
              bound.h = EMBED_CARD_HEIGHT[style];

              newId = ctx.store.addBlock(
                flavour,
                {
                  url,
                  caption,
                  title,
                  description,
                  style,
                  xywh: bound.serialize(),
                },
                parent
              );
            } else if (canEmbedAsIframe(ctx.std, url)) {
              const embedIframeService = ctx.std.get(EmbedIframeService);
              const config = embedIframeService.getConfig(url);
              if (!config) {
                return;
              }

              const bound = Bound.deserialize(xywh);
              const options = config.options;
              const { widthInSurface, heightInSurface } = options ?? {};
              bound.w = widthInSurface ?? EMBED_IFRAME_DEFAULT_WIDTH_IN_SURFACE;
              bound.h =
                heightInSurface ?? EMBED_IFRAME_DEFAULT_HEIGHT_IN_SURFACE;

              newId = ctx.store.addBlock(
                'affine:embed-iframe',
                { url, caption, title, description, xywh: bound.serialize() },
                parent
              );
            }

            if (!newId) return;

            ctx.command.exec(reassociateConnectorsCommand, { oldId, newId });

            ctx.store.deleteBlock(model);

            // Selects new block
            ctx.gfx.selection.set({ editing: false, elements: [newId] });

            ctx.track('SelectedView', {
              ...trackBaseProps,
              control: 'select view',
              type: 'embed view',
            });
          },
        },
      ],
      when(ctx) {
        const model = ctx.getCurrentModelByType(BookmarkBlockModel);
        if (!model) return false;
        const { url } = model.props;
        return (
          canEmbedAsIframe(ctx.std, url) || canEmbedAsEmbedBlock(ctx.std, url)
        );
      },
      content(ctx) {
        const model = ctx.getCurrentModelByType(BookmarkBlockModel);
        if (!model) return null;

        const actions = this.actions.map(action => ({ ...action }));
        const viewType$ = signal('Card view');
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
      id: 'b.style',
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
      ).filter(action => BookmarkStyles.includes(action.id)),
      content(ctx) {
        const model = ctx.getCurrentModelByType(BookmarkBlockModel);
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
      ...captionAction,
      id: 'c.caption',
    },
    {
      id: 'd.scale',
      content(ctx) {
        const model = ctx.getCurrentModelByType(BookmarkBlockModel);
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
          bounds.w = EMBED_CARD_WIDTH[style] * scale;
          bounds.h = EMBED_CARD_HEIGHT[style] * scale;
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

  when: ctx => ctx.getSurfaceModelsByType(BookmarkBlockModel).length === 1,
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
