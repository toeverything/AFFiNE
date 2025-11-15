import {
  EdgelessToolbarToolMixin,
  QuickToolMixin,
} from '@blocksuite/affine-widget-edgeless-toolbar';
import { PresentationIcon } from '@blocksuite/icons/lit';
import { css, html, LitElement } from 'lit';

import { PresentTool } from '../present-tool';

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

  override type = PresentTool;

  override render() {
    return html`<edgeless-tool-icon-button
    class="edgeless-frame-navigator-button"
    .tooltip=${'Present'}
    .tooltipOffset=${17}
    .iconContainerPadding=${6}
    .iconSize=${'24px'}
    @click=${() => {
      this.setEdgelessTool(PresentTool);
    }}
  >
    ${PresentationIcon()}
    </edgeless-tool-icon-button>
  </div>`;
  }
}
