import {
  EdgelessToolbarToolMixin,
  QuickToolMixin,
} from '@blocksuite/affine-widget-edgeless-toolbar';
import type { GfxToolsFullOptionValue } from '@blocksuite/block-std/gfx';
import { PresentationIcon } from '@blocksuite/icons/lit';
import { css, html, LitElement } from 'lit';

export class EdgelessPresentButton extends QuickToolMixin(
  EdgelessToolbarToolMixin(LitElement)
) {
  static override styles = css`
    :host {
      display: flex;
    }
    .edgeless-note-button {
      display: flex;
      position: relative;
    }
  `;

  override type: GfxToolsFullOptionValue['type'] = 'frameNavigator';

  override render() {
    return html`<edgeless-tool-icon-button
    class="edgeless-frame-navigator-button"
    .tooltip=${'Present'}
    .tooltipOffset=${17}
    .iconContainerPadding=${6}
    .iconSize=${'24px'}
    @click=${() => {
      this.setEdgelessTool({
        type: 'frameNavigator',
      });
    }}
  >
    ${PresentationIcon()}
    </edgeless-tool-icon-button>
  </div>`;
  }
}
