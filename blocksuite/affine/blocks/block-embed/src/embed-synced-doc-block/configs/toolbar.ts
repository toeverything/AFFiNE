import { toast } from '@blocksuite/affine-components/toast';
import { EditorChevronDown } from '@blocksuite/affine-components/toolbar';
import { EmbedSyncedDocModel } from '@blocksuite/affine-model';
import {
  ActionPlacement,
  type LinkEventType,
  type OpenDocMode,
  type ToolbarAction,
  type ToolbarActionGroup,
  type ToolbarContext,
  type ToolbarModuleConfig,
  ToolbarModuleExtension,
} from '@blocksuite/affine-shared/services';
import { getBlockProps } from '@blocksuite/affine-shared/utils';
import { BlockFlavourIdentifier } from '@blocksuite/block-std';
import { Bound } from '@blocksuite/global/gfx';
import {
  CaptionIcon,
  CopyIcon,
  DeleteIcon,
  DuplicateIcon,
  ExpandFullIcon,
  OpenInNewIcon,
} from '@blocksuite/icons/lit';
import { type ExtensionType, Slice } from '@blocksuite/store';
import { computed, signal } from '@preact/signals-core';
import { html } from 'lit';
import { ifDefined } from 'lit/directives/if-defined.js';
import { keyed } from 'lit/directives/keyed.js';
import { repeat } from 'lit/directives/repeat.js';

import { EmbedSyncedDocBlockComponent } from '../embed-synced-doc-block';

const trackBaseProps = {
  category: 'linked doc',
  type: 'embed view',
};

const createOnToggleFn =
  (
    ctx: ToolbarContext,
    name: Extract<
      LinkEventType,
      'OpenedViewSelector' | 'OpenedCardScaleSelector'
    >,
    control: 'switch view' | 'switch card scale'
  ) =>
  (e: CustomEvent<boolean>) => {
    e.stopPropagation();
    const opened = e.detail;
    if (!opened) return;

    ctx.track(name, { ...trackBaseProps, control });
  };

const openDocActions = [
  {
    mode: 'open-in-active-view',
    id: 'a.open-in-active-view',
    label: 'Open this doc',
    icon: ExpandFullIcon(),
  },
] as const satisfies (Pick<ToolbarAction, 'id' | 'label' | 'icon'> & {
  mode: OpenDocMode;
})[];

const openDocActionGroup = {
  placement: ActionPlacement.Start,
  id: 'A.open-doc',
  content(ctx) {
    const block = ctx.getCurrentBlockByType(EmbedSyncedDocBlockComponent);
    if (!block) return null;

    const actions = openDocActions.map<ToolbarAction>(action => {
      const openMode = action.mode;
      const shouldOpenInActiveView = openMode === 'open-in-active-view';
      return {
        ...action,
        disabled: shouldOpenInActiveView
          ? block.model.props.pageId === ctx.store.id
          : false,
        when: true,
        run: (_ctx: ToolbarContext) => block.open({ openMode }),
      };
    });

    return html`
      <editor-menu-button
        .contentPadding="${'8px'}"
        .button=${html`
          <editor-icon-button aria-label="Open doc" .tooltip=${'Open doc'}>
            ${OpenInNewIcon()} ${EditorChevronDown}
          </editor-icon-button>
        `}
      >
        <div data-size="small" data-orientation="vertical">
          ${repeat(
            actions,
            action => action.id,
            ({ label, icon, run, disabled }) => html`
              <editor-menu-action
                aria-label=${ifDefined(label)}
                ?disabled=${ifDefined(
                  typeof disabled === 'function' ? disabled(ctx) : disabled
                )}
                @click=${() => run?.(ctx)}
              >
                ${icon}<span class="label">${label}</span>
              </editor-menu-action>
            `
          )}
        </div>
      </editor-menu-button>
    `;
  },
} as const satisfies ToolbarAction;

const conversionsActionGroup = {
  id: 'a.conversions',
  actions: [
    {
      id: 'inline',
      label: 'Inline view',
      run(ctx) {
        const block = ctx.getCurrentBlockByType(EmbedSyncedDocBlockComponent);
        block?.convertToInline();

        // Clears
        ctx.select('note');
        ctx.reset();

        ctx.track('SelectedView', {
          ...trackBaseProps,
          control: 'select view',
          type: 'inline view',
        });
      },
      when: ctx => !ctx.hasSelectedSurfaceModels,
    },
    {
      id: 'card',
      label: 'Card view',
      run(ctx) {
        const block = ctx.getCurrentBlockByType(EmbedSyncedDocBlockComponent);
        block?.convertToCard();

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
  content(ctx) {
    const model = ctx.getCurrentModelByType(EmbedSyncedDocModel);
    if (!model) return null;

    const actions = this.actions.map(action => ({ ...action }));
    const viewType$ = signal('Embed view');
    const onToggle = createOnToggleFn(ctx, 'OpenedViewSelector', 'switch view');

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
} as const satisfies ToolbarActionGroup<ToolbarAction>;

const captionAction = {
  id: 'c.caption',
  tooltip: 'Caption',
  icon: CaptionIcon(),
  run(ctx) {
    const block = ctx.getCurrentBlockByType(EmbedSyncedDocBlockComponent);
    block?.captionEditor?.show();

    ctx.track('OpenedCaptionEditor', {
      ...trackBaseProps,
      control: 'add caption',
    });
  },
} as const satisfies ToolbarAction;

const builtinToolbarConfig = {
  actions: [
    openDocActionGroup,
    conversionsActionGroup,
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
            const model = ctx.getCurrentModelByType(EmbedSyncedDocModel);
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
            const model = ctx.getCurrentModelByType(EmbedSyncedDocModel);
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
      id: 'c.delete',
      label: 'Delete',
      icon: DeleteIcon(),
      variant: 'destructive',
      run(ctx) {
        const model = ctx.getCurrentModelByType(EmbedSyncedDocModel);
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
    openDocActionGroup,
    conversionsActionGroup,
    captionAction,
    {
      id: 'd.scale',
      content(ctx) {
        const model = ctx.getCurrentBlockByType(
          EmbedSyncedDocBlockComponent
        )?.model;
        if (!model) return null;

        const scale$ = computed(() =>
          Math.round(100 * (model.props.scale$.value ?? 1))
        );
        const onSelect = (e: CustomEvent<number>) => {
          e.stopPropagation();

          const scale = e.detail / 100;

          const oldScale = model.props.scale ?? 1;
          const ratio = scale / oldScale;
          const bounds = Bound.deserialize(model.xywh);
          bounds.h *= ratio;
          bounds.w *= ratio;
          const xywh = bounds.serialize();

          ctx.store.updateBlock(model, { scale, xywh });

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

  when: ctx => ctx.getSurfaceModelsByType(EmbedSyncedDocModel).length === 1,
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
