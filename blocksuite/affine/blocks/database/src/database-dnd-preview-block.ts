import type { DatabaseBlockModel } from '@blocksuite/affine-model';
import { unsafeCSSVarV2 } from '@blocksuite/affine-shared/theme';
import { DatabaseListViewIcon } from '@blocksuite/icons/lit';
import { BlockComponent } from '@blocksuite/std';
import { css, html } from 'lit';

export class DatabaseDndPreviewBlockComponent extends BlockComponent<DatabaseBlockModel> {
  static override styles = css`
    .affine-database-preview-container {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      padding: 4px;
      box-sizing: border-box;

      border-radius: 8px;
      background-color: ${unsafeCSSVarV2(
        'layer/background/overlayPanel',
        '#FBFBFC'
      )};
    }

    .database-preview-content {
      padding: 4px 16px;
      display: flex;
      gap: 8px;
    }

    .database-preview-content > svg {
      color: ${unsafeCSSVarV2('icon/primary', '#77757D')};
    }

    .database-preview-content > .text {
      color: var(--affine-text-primary-color);
      color: ${unsafeCSSVarV2('text/primary', '#121212')};
      font-size: 14px;
      line-height: 24px;
    }
  `;

  override renderBlock() {
    return html`<div
      class="affine-database-preview-container"
      contenteditable="false"
    >
      <div class="database-preview-content">
        ${DatabaseListViewIcon({ width: '24px', height: '24px' })}
        <span class="text">Database Block</span>
      </div>
    </div>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'affine-dnd-preview-database': DatabaseDndPreviewBlockComponent;
  }
}
