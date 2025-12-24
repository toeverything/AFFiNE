import { scrollbarStyle } from '@blocksuite/affine-shared/styles';
import { unsafeCSSVarV2 } from '@blocksuite/affine-shared/theme';
import { SignalWatcher } from '@blocksuite/global/lit';
import { consume } from '@lit/context';
import { css, html, LitElement } from 'lit';
import { classMap } from 'lit/directives/class-map.js';

import {
  type AdapterItem,
  type AdapterPanelContext,
  adapterPanelContext,
  ADAPTERS,
} from '../config';

export const AFFINE_ADAPTER_PANEL_BODY = 'affine-adapter-panel-body';

export class AdapterPanelBody extends SignalWatcher(LitElement) {
  static override styles = css`
    .adapter-panel-body {
      width: 100%;
      height: calc(100% - 50px);
      box-sizing: border-box;
      overflow: auto;
      padding: 8px 16px;
    }

    ${scrollbarStyle('.adapter-panel-body')}

    .adapter-content {
      width: 100%;
      height: 100%;
      white-space: pre-wrap;
      color: var(--affine-text-primary-color);
      font-size: var(--affine-font-sm);
      box-sizing: border-box;
    }

    .html-content {
      display: flex;
      gap: 8px;
      flex-direction: column;
      justify-content: space-between;
    }

    .html-preview-container,
    .html-panel-content {
      width: 100%;
      flex: 1 0 0;
      border: none;
      box-sizing: border-box;
      color: var(--affine-text-primary-color);
      overflow: auto;
    }

    ${scrollbarStyle('.html-panel-content')}

    .html-panel-footer {
      width: 100%;
      height: 24px;
      display: flex;
    }

    .html-toggle-container {
      display: flex;
      background: ${unsafeCSSVarV2('segment/background')};
      justify-content: flex-start;
      padding: 2px;
      border-radius: 4px;
    }

    .html-toggle-item {
      cursor: pointer;
      display: flex;
      padding: 0px 4px;
      justify-content: center;
      align-items: center;
      font-size: 12px;
      font-weight: 500;
      line-height: 20px;
      border-radius: 4px;
      color: ${unsafeCSSVarV2('text/primary')};
    }

    .html-toggle-item:hover {
      background: ${unsafeCSSVarV2('layer/background/hoverOverlay')};
    }

    .html-toggle-item[active] {
      background: ${unsafeCSSVarV2('segment/button')};
      box-shadow:
        var(--Shadow-buttonShadow-1-x, 0px) var(--Shadow-buttonShadow-1-y, 0px)
          var(--Shadow-buttonShadow-1-blur, 1px) 0px
          var(--Shadow-buttonShadow-1-color, rgba(0, 0, 0, 0.12)),
        var(--Shadow-buttonShadow-2-x, 0px) var(--Shadow-buttonShadow-2-y, 1px)
          var(--Shadow-buttonShadow-2-blur, 5px) 0px
          var(--Shadow-buttonShadow-2-color, rgba(0, 0, 0, 0.12));
    }

    .adapter-container {
      display: none;
      width: 100%;
      height: 100%;
      box-sizing: border-box;
    }

    .adapter-container.active {
      display: block;
    }
  `;

  get activeAdapter() {
    return this._context.activeAdapter$.value;
  }

  get isHtmlPreview() {
    return this._context.isHtmlPreview$.value;
  }

  get htmlContent() {
    return this._context.htmlContent$.value;
  }

  get markdownContent() {
    return this._context.markdownContent$.value;
  }

  get plainTextContent() {
    return this._context.plainTextContent$.value;
  }

  get docSnapshot() {
    return this._context.docSnapshot$.value;
  }

  private _renderHtmlPanel() {
    return html`
      ${this.isHtmlPreview
        ? html`<iframe
            class="html-preview-container"
            .srcdoc=${this.htmlContent}
            sandbox="allow-same-origin"
          ></iframe>`
        : html`<div class="html-panel-content">${this.htmlContent}</div>`}
      <div class="html-panel-footer">
        <div class="html-toggle-container">
          <span
            class="html-toggle-item"
            ?active=${!this.isHtmlPreview}
            @click=${() => (this._context.isHtmlPreview$.value = false)}
            >Source</span
          >
          <span
            class="html-toggle-item"
            ?active=${this.isHtmlPreview}
            @click=${() => (this._context.isHtmlPreview$.value = true)}
            >Preview</span
          >
        </div>
      </div>
    `;
  }

  private readonly _renderAdapterContent = (adapter: AdapterItem) => {
    switch (adapter.id) {
      case 'html':
        return this._renderHtmlPanel();
      case 'markdown':
        return this.markdownContent;
      case 'plaintext':
        return this.plainTextContent;
      case 'snapshot':
        return this.docSnapshot
          ? JSON.stringify(this.docSnapshot, null, 4)
          : '';
      default:
        return '';
    }
  };

  private readonly _renderAdapterContainer = (adapter: AdapterItem) => {
    const containerClasses = classMap({
      'adapter-container': true,
      active: this.activeAdapter.id === adapter.id,
    });

    const contentClasses = classMap({
      'adapter-content': true,
      [`${adapter.id}-content`]: true,
    });

    const content = this._renderAdapterContent(adapter);

    return html`
      <div class=${containerClasses}>
        <div class=${contentClasses}>${content}</div>
      </div>
    `;
  };

  override render() {
    return html`
      <div class="adapter-panel-body">
        ${ADAPTERS.map(adapter => this._renderAdapterContainer(adapter))}
      </div>
    `;
  }

  @consume({ context: adapterPanelContext })
  private accessor _context!: AdapterPanelContext;
}

declare global {
  interface HTMLElementTagNameMap {
    [AFFINE_ADAPTER_PANEL_BODY]: AdapterPanelBody;
  }
}
