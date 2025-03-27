import type { SurfaceRefBlockComponent } from '@blocksuite/affine-block-surface-ref';
import { peek } from '@blocksuite/affine-components/peek';
import { toast } from '@blocksuite/affine-components/toast';
import {
  cloneGroups,
  getMoreMenuConfig,
  type MenuItem,
  type MenuItemGroup,
  renderGroups,
} from '@blocksuite/affine-components/toolbar';
import {
  FrameBlockModel,
  GroupElementModel,
  MindmapElementModel,
  ShapeElementModel,
  type SurfaceRefBlockModel,
} from '@blocksuite/affine-model';
import {
  copySelectedModelsCommand,
  draftSelectedModelsCommand,
} from '@blocksuite/affine-shared/commands';
import { unsafeCSSVar, unsafeCSSVarV2 } from '@blocksuite/affine-shared/theme';
import type { ButtonPopperOptions } from '@blocksuite/affine-shared/utils';
import { WidgetComponent } from '@blocksuite/block-std';
import {
  ArrowDownSmallIcon,
  CaptionIcon,
  CenterPeekIcon,
  CopyIcon,
  EdgelessIcon,
  FrameIcon,
  GroupIcon,
  MindmapIcon,
  MoreVerticalIcon,
  OpenInNewIcon,
} from '@blocksuite/icons/lit';
import { css, html, nothing, type TemplateResult } from 'lit';
import { ifDefined } from 'lit/directives/if-defined.js';
import { repeat } from 'lit/directives/repeat.js';
import { styleMap } from 'lit/directives/style-map.js';
import { when } from 'lit/directives/when.js';

import { BUILT_IN_GROUPS } from './config.js';
import { SurfaceRefToolbarContext } from './context.js';

export const AFFINE_SURFACE_REF_TOOLBAR = 'affine-surface-ref-toolbar';

export class AffineSurfaceRefToolbar extends WidgetComponent<
  SurfaceRefBlockModel,
  SurfaceRefBlockComponent
> {
  static override styles = css`
    :host {
      position: absolute;
      top: 0;
      left: 0;

      width: 100%;
      gap: 4px;
      padding: 4px;
      margin: 0;
      display: flex;
      justify-content: flex-end;

      editor-icon-button,
      editor-menu-button {
        background: ${unsafeCSSVarV2('button/iconButtonSolid')};
        color: ${unsafeCSSVarV2('text/primary')};
        box-shadow: ${unsafeCSSVar('shadow1')};
        border-radius: 4px;
      }
    }

    .surface-ref-toolbar-title {
      display: flex;
      padding: 2px 4px;
      margin-right: auto;
      align-items: center;
      gap: 4px;
      border-radius: 2px;
      background: ${unsafeCSSVarV2('button/iconButtonSolid')};

      svg {
        color: ${unsafeCSSVarV2('icon/primary')};
        width: 16px;
        height: 16px;
      }

      span {
        color: ${unsafeCSSVarV2('text/primary')};
        font-size: 12px;
        font-weight: 500;
        line-height: 20px;
      }
    }
  `;

  private readonly _popoverOptions: Partial<ButtonPopperOptions> = {
    mainAxis: 4,
    stateUpdated: ({ display }) => {
      this.dataset.openMenuDisplay = display;
    },
  };

  /*
   * Caches the more menu items.
   * Currently only supports configuring more menu.
   */
  moreGroups: MenuItemGroup<SurfaceRefToolbarContext>[] =
    cloneGroups(BUILT_IN_GROUPS);

  override connectedCallback() {
    super.connectedCallback();
    this.moreGroups = getMoreMenuConfig(this.std).configure(this.moreGroups);

    this.disposables.addFromEvent(this, 'dblclick', e => {
      e.stopPropagation();
    });
  }

  private _renderTitle() {
    if (!this.block) return nothing;
    const { referenceModel } = this.block;
    if (!referenceModel) return nothing;

    let title = '';
    let icon: TemplateResult<1> | null = null;
    if (referenceModel instanceof GroupElementModel) {
      title = referenceModel.title.toString();
      icon = GroupIcon();
    } else if (referenceModel instanceof FrameBlockModel) {
      title = referenceModel.props.title.toString();
      icon = FrameIcon();
    } else if (referenceModel instanceof MindmapElementModel) {
      const rootElement = referenceModel.tree.element;
      if (rootElement instanceof ShapeElementModel) {
        title = rootElement.text?.toString() ?? '';
      }
      icon = MindmapIcon();
    }

    return html`<div class="surface-ref-toolbar-title">
      ${icon}
      <span>${title}</span>
    </div>`;
  }

  private _renderOpenButton() {
    const referenceModel = this.block?.referenceModel;
    if (!referenceModel) return nothing;

    const openMenuActions: MenuItem[] = [
      {
        type: 'open-in-edgeless',
        label: 'Open in Edgeless',
        icon: EdgelessIcon(),
        action: () => this.block?.viewInEdgeless(),
        disabled: this.block.model.doc.readonly,
      },
      {
        type: 'open-in-center-peek',
        label: 'Open in center peek',
        icon: CenterPeekIcon(),
        action: () => this.block && peek(this.block),
      },
      // TODO(@L-Sun): add split view and new tab
    ];

    return html`<editor-menu-button
      data-show
      aria-label="Open"
      style=${styleMap({
        '--content-padding': '8px',
      })}
      .button=${html`
        <editor-icon-button .iconContainerPadding=${4} .iconSize=${'16px'}>
          ${OpenInNewIcon()} ${ArrowDownSmallIcon()}
        </editor-icon-button>
      `}
      .popperOptions=${this._popoverOptions}
    >
      <div data-orientation="vertical">
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
    </editor-menu-button>`;
  }

  private _moreButton() {
    if (!this.block) return nothing;

    const moreMenuActions = renderGroups(
      this.moreGroups,
      new SurfaceRefToolbarContext(this.block, new AbortController())
    );

    return html`<editor-menu-button
      data-show
      style=${styleMap({
        '--content-padding': '8px',
      })}
      .button=${html`
        <editor-icon-button .iconContainerPadding=${4} .iconSize=${'16px'}>
          ${MoreVerticalIcon()}
        </editor-icon-button>
      `}
      .popperOptions=${this._popoverOptions}
    >
      <div data-orientation="vertical">${moreMenuActions}</div>
    </editor-menu-button>`;
  }

  private _renderButtons() {
    if (!this.block) return nothing;
    const readonly = this.block.model.doc.readonly;
    const buttons = [
      this._renderOpenButton(),
      when(
        !readonly,
        () =>
          html`<editor-icon-button
            .iconContainerPadding=${4}
            .iconSize=${'16px'}
            @click=${() => {
              if (!this.block) return;
              this.std.command
                .chain()
                .pipe(draftSelectedModelsCommand, {
                  selectedModels: [this.block.model],
                })
                .pipe(copySelectedModelsCommand)
                .run();
              toast(this.block.std.host, 'Copied to clipboard');
            }}
          >
            ${CopyIcon()}
          </editor-icon-button>`
      ),
      when(
        !readonly,
        () =>
          html`<editor-icon-button
            .iconContainerPadding=${4}
            .iconSize=${'16px'}
            @click=${() => {
              if (!this.block) return;
              this.block.captionElement.show();
            }}
          >
            ${CaptionIcon()}
          </editor-icon-button>`
      ),
      this._moreButton(),
    ];

    return buttons;
  }

  override render() {
    if (!this.block) return nothing;
    return html`${this._renderTitle()} ${this._renderButtons()}`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    [AFFINE_SURFACE_REF_TOOLBAR]: AffineSurfaceRefToolbar;
  }
}
