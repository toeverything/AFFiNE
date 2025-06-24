import { LoadingIcon } from '@blocksuite/affine-components/icons';
import { unsafeCSSVarV2 } from '@blocksuite/affine-shared/theme';
import { ShadowlessElement } from '@blocksuite/std';
import { css, html } from 'lit';

import { importMindMapIcon } from './icons.js';

export class MindMapPlaceholder extends ShadowlessElement {
  static override styles = css`
    mindmap-import-placeholder {
      display: flex;
      flex-direction: column;

      padding: 28px 12px 12px;
      box-sizing: border-box;
      width: 200px;
      height: 122px;

      border-radius: 12px;
      gap: 12px;

      background-color: ${unsafeCSSVarV2('layer/background/secondary')};
      border: 1px solid ${unsafeCSSVarV2('layer/insideBorder/border')};
      color: ${unsafeCSSVarV2('text/placeholder')};

      box-shadow: 0px 0px 4px 0px rgba(66, 65, 73, 0.14);
    }

    mindmap-import-placeholder .preview-icon {
      text-align: center;
    }

    mindmap-import-placeholder .description {
      display: flex;
      gap: 8px;

      color: ${unsafeCSSVarV2('text/placeholder')};
      font-size: 14px;
      line-height: 22px;

      align-items: center;
    }
  `;

  override render() {
    return html`<div class="placeholder-container">
      <div class="preview-icon">${importMindMapIcon}</div>
      <div class="description">
        ${LoadingIcon()}
        <span>Importing mind map...</span>
      </div>
    </div>`;
  }
}
