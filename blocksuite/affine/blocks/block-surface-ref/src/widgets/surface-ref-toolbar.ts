import type { SurfaceRefBlockComponent } from '@blocksuite/affine-block-surface-ref';
import { HoverController } from '@blocksuite/affine-components/hover';
import { CaptionIcon, OpenIcon } from '@blocksuite/affine-components/icons';
import { isPeekable, peek } from '@blocksuite/affine-components/peek';
import {
  cloneGroups,
  getMoreMenuConfig,
  type MenuItem,
  type MenuItemGroup,
  renderGroups,
  renderToolbarSeparator,
} from '@blocksuite/affine-components/toolbar';
import type { SurfaceRefBlockModel } from '@blocksuite/affine-model';
import { PAGE_HEADER_HEIGHT } from '@blocksuite/affine-shared/consts';
import {
  BlockSelection,
  TextSelection,
  WidgetComponent,
} from '@blocksuite/block-std';
import {
  ArrowDownSmallIcon,
  CenterPeekIcon,
  EdgelessIcon,
  MoreVerticalIcon,
} from '@blocksuite/icons/lit';
import { offset, shift } from '@floating-ui/dom';
import { html, nothing } from 'lit';
import { ifDefined } from 'lit/directives/if-defined.js';
import { join } from 'lit/directives/join.js';
import { repeat } from 'lit/directives/repeat.js';

import { BUILT_IN_GROUPS } from './config.js';
import { SurfaceRefToolbarContext } from './context.js';

export const AFFINE_SURFACE_REF_TOOLBAR = 'affine-surface-ref-toolbar';

export class AffineSurfaceRefToolbar extends WidgetComponent<
  SurfaceRefBlockModel,
  SurfaceRefBlockComponent
> {
  /*
   * Caches the more menu items.
   * Currently only supports configuring more menu.
   */
  moreGroups: MenuItemGroup<SurfaceRefToolbarContext>[] =
    cloneGroups(BUILT_IN_GROUPS);

  private readonly _hoverController = new HoverController(
    this,
    ({ abortController }) => {
      const surfaceRefBlock = this.block;
      if (!surfaceRefBlock) {
        return null;
      }
      const selection = this.host.selection;

      const textSelection = selection.find(TextSelection);
      if (
        !!textSelection &&
        (!!textSelection.to || !!textSelection.from.length)
      ) {
        return null;
      }

      const blockSelections = selection.filter(BlockSelection);
      if (
        blockSelections.length > 1 ||
        (blockSelections.length === 1 &&
          blockSelections[0].blockId !== surfaceRefBlock.blockId)
      ) {
        return null;
      }

      return {
        template: SurfaceRefToolbarOptions({
          context: new SurfaceRefToolbarContext(this.block, abortController),
          groups: this.moreGroups,
        }),
        computePosition: {
          referenceElement: this.block,
          placement: 'top-start',
          middleware: [
            offset({
              mainAxis: 12,
              crossAxis: 10,
            }),
            shift({
              crossAxis: true,
              padding: {
                top: PAGE_HEADER_HEIGHT + 12,
                bottom: 12,
                right: 12,
              },
            }),
          ],
          autoUpdate: true,
        },
      };
    }
  );

  override connectedCallback() {
    super.connectedCallback();

    this.moreGroups = getMoreMenuConfig(this.std).configure(this.moreGroups);
    if (!this.block) {
      return;
    }
    this._hoverController.setReference(this.block);
  }
}

declare global {
  interface HTMLElementTagNameMap {
    [AFFINE_SURFACE_REF_TOOLBAR]: AffineSurfaceRefToolbar;
  }
}

function SurfaceRefToolbarOptions({
  context,
  groups,
}: {
  context: SurfaceRefToolbarContext;
  groups: MenuItemGroup<SurfaceRefToolbarContext>[];
}) {
  const { blockComponent, abortController } = context;
  const readonly = blockComponent.model.doc.readonly;
  const hasValidReference = !!blockComponent.referenceModel;

  const openMenuActions: MenuItem[] = [];

  const iconSize = { width: '20px', height: '20px' };
  if (hasValidReference) {
    openMenuActions.push({
      type: 'open-in-edgeless',
      label: 'Open in edgeless',
      icon: EdgelessIcon(iconSize),
      action: () => blockComponent.viewInEdgeless(),
      disabled: readonly,
    });

    if (isPeekable(blockComponent)) {
      openMenuActions.push({
        type: 'open-in-center-peek',
        label: 'Open in center peek',
        icon: CenterPeekIcon(iconSize),
        action: () => peek(blockComponent),
      });
    }
  }

  const moreMenuActions = renderGroups(groups, context);

  const buttons = [
    openMenuActions.length
      ? html`
          <editor-menu-button
            .contentPadding=${'8px'}
            .button=${html`
              <editor-icon-button
                aria-label="Open doc"
                .justify=${'space-between'}
                .labelHeight=${'20px'}
              >
                ${OpenIcon}${ArrowDownSmallIcon({
                  width: '16px',
                  height: '16px',
                })}
              </editor-icon-button>
            `}
          >
            <div data-size="large" data-orientation="vertical">
              ${repeat(
                openMenuActions,
                button => button.label,
                ({ label, icon, action, disabled }) => html`
                  <editor-menu-action
                    aria-label=${ifDefined(label)}
                    ?disabled=${disabled}
                    @click=${action}
                  >
                    ${icon}<span class="label">${label}</span>
                  </editor-menu-action>
                `
              )}
            </div>
          </editor-menu-button>
        `
      : nothing,

    readonly
      ? nothing
      : html`
          <editor-icon-button
            aria-label="Caption"
            .tooltip=${'Add Caption'}
            @click=${() => {
              abortController.abort();
              blockComponent.captionElement.show();
            }}
          >
            ${CaptionIcon}
          </editor-icon-button>
        `,

    html`
      <editor-menu-button
        .contentPadding=${'8px'}
        .button=${html`
          <editor-icon-button
            aria-label="More"
            .tooltip=${'More'}
            .iconSize=${'20px'}
          >
            ${MoreVerticalIcon()}
          </editor-icon-button>
        `}
      >
        <div data-size="large" data-orientation="vertical">
          ${moreMenuActions}
        </div>
      </editor-menu-button>
    `,
  ];

  return html`
    <editor-toolbar class="surface-ref-toolbar-container">
      ${join(
        buttons.filter(button => button !== nothing),
        renderToolbarSeparator
      )}
    </editor-toolbar>
  `;
}
