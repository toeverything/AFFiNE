import { QuickToolMixin } from '@blocksuite/affine-widget-edgeless-toolbar';
import type { GfxToolsFullOptionValue } from '@blocksuite/block-std/gfx';
import { FrameIcon } from '@blocksuite/icons/lit';
import { css, html, LitElement } from 'lit';

export class EdgelessFrameToolButton extends QuickToolMixin(LitElement) {
  static override styles = css`
    :host {
      display: flex;
    }
  `;

  override type: GfxToolsFullOptionValue['type'] = 'frame';

  private _toggleFrameMenu() {
    if (this.tryDisposePopper()) return;

    const menu = this.createPopper('edgeless-frame-menu', this);
    menu.element.edgeless = this.edgeless;
  }

  override render() {
    const type = this.edgelessTool?.type;
    return html`
      <edgeless-tool-icon-button
        class="edgeless-frame-button"
        .tooltip=${this.popper
          ? ''
          : html`<affine-tooltip-content-with-shortcut
              data-tip="${'Frame'}"
              data-shortcut="${'F'}"
            ></affine-tooltip-content-with-shortcut>`}
        .tooltipOffset=${17}
        .iconSize=${'24px'}
        .active=${type === 'frame'}
        .iconContainerPadding=${6}
        @click=${() => {
          // don't update tool before toggling menu
          this._toggleFrameMenu();
          this.setEdgelessTool({ type: 'frame' });
        }}
      >
        ${FrameIcon()}
        <toolbar-arrow-up-icon></toolbar-arrow-up-icon>
      </edgeless-tool-icon-button>
    `;
  }
}
