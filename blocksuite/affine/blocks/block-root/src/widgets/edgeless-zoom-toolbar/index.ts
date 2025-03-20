import { EdgelessLegacySlotIdentifier } from '@blocksuite/affine-block-surface';
import type { RootBlockModel } from '@blocksuite/affine-model';
import { WidgetComponent } from '@blocksuite/block-std';
import { effect } from '@preact/signals-core';
import { css, html, nothing } from 'lit';
import { state } from 'lit/decorators.js';

import type { EdgelessRootBlockComponent } from '../../edgeless/edgeless-root-block.js';

export const AFFINE_EDGELESS_ZOOM_TOOLBAR_WIDGET =
  'affine-edgeless-zoom-toolbar-widget';

export class AffineEdgelessZoomToolbarWidget extends WidgetComponent<
  RootBlockModel,
  EdgelessRootBlockComponent
> {
  static override styles = css`
    :host {
      position: absolute;
      bottom: 20px;
      left: 12px;
      z-index: var(--affine-z-index-popover);
      display: flex;
      justify-content: center;
      -webkit-user-select: none;
      user-select: none;
    }

    @container viewport (width <= 1200px) {
      edgeless-zoom-toolbar {
        display: none;
      }
    }

    @container viewport (width > 1200px) {
      zoom-bar-toggle-button {
        display: none;
      }
    }
  `;

  get edgeless() {
    return this.block;
  }

  override connectedCallback() {
    super.connectedCallback();

    this.disposables.add(
      effect(() => {
        const currentTool = this.edgeless?.gfx.tool.currentToolName$.value;

        if (currentTool !== 'frameNavigator') {
          this._hide = false;
        }
        this.requestUpdate();
      })
    );
  }

  override firstUpdated() {
    const { disposables, std } = this;
    const slots = std.get(EdgelessLegacySlotIdentifier);

    disposables.add(
      slots.navigatorSettingUpdated.subscribe(({ hideToolbar }) => {
        if (hideToolbar !== undefined) {
          this._hide = hideToolbar;
        }
      })
    );
  }

  override render() {
    if (this._hide || !this.edgeless) {
      return nothing;
    }

    return html`
      <edgeless-zoom-toolbar .edgeless=${this.edgeless}></edgeless-zoom-toolbar>
      <zoom-bar-toggle-button
        .edgeless=${this.edgeless}
      ></zoom-bar-toggle-button>
    `;
  }

  @state()
  private accessor _hide = false;
}
