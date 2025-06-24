import type { Store, TransformerMiddleware } from '@blocksuite/affine/store';
import {
  type HtmlAdapter,
  HtmlAdapterFactoryIdentifier,
  type MarkdownAdapter,
  MarkdownAdapterFactoryIdentifier,
  type PlainTextAdapter,
  PlainTextAdapterFactoryIdentifier,
} from '@blocksuite/affine-shared/adapters';
import { SignalWatcher, WithDisposable } from '@blocksuite/global/lit';
import { provide } from '@lit/context';
import { effect, signal } from '@preact/signals-core';
import { baseTheme } from '@toeverything/theme';
import { css, html, LitElement, type PropertyValues, unsafeCSS } from 'lit';
import { property } from 'lit/decorators.js';

import {
  type AdapterPanelContext,
  adapterPanelContext,
  ADAPTERS,
} from './config';

export const AFFINE_ADAPTER_PANEL = 'affine-adapter-panel';

export class AdapterPanel extends SignalWatcher(WithDisposable(LitElement)) {
  static override styles = css`
    :host {
      display: block;
      width: 100%;
      height: 100%;
      box-sizing: border-box;
    }

    .adapters-container {
      width: 100%;
      height: 100%;
      background-color: var(--affine-background-primary-color);
      box-sizing: border-box;
      font-family: ${unsafeCSS(baseTheme.fontSansFamily)};
    }
  `;

  get activeAdapter() {
    return this._context.activeAdapter$.value;
  }

  private _createJob() {
    return this.store.getTransformer(this.transformerMiddlewares);
  }

  private _getDocSnapshot() {
    const job = this._createJob();
    const result = job.docToSnapshot(this.store);
    return result;
  }

  private async _getHtmlContent() {
    try {
      const job = this._createJob();
      const htmlAdapterFactory = this.store.get(HtmlAdapterFactoryIdentifier);
      const htmlAdapter = htmlAdapterFactory.get(job) as HtmlAdapter;
      const result = await htmlAdapter.fromDoc(this.store);
      return result?.file;
    } catch (error) {
      console.error('Failed to get html content', error);
      return '';
    }
  }

  private async _getMarkdownContent() {
    try {
      const job = this._createJob();
      const markdownAdapterFactory = this.store.get(
        MarkdownAdapterFactoryIdentifier
      );
      const markdownAdapter = markdownAdapterFactory.get(
        job
      ) as MarkdownAdapter;
      const result = await markdownAdapter.fromDoc(this.store);
      return result?.file;
    } catch (error) {
      console.error('Failed to get markdown content', error);
      return '';
    }
  }

  private async _getPlainTextContent() {
    try {
      const job = this._createJob();
      const plainTextAdapterFactory = this.store.get(
        PlainTextAdapterFactoryIdentifier
      );
      const plainTextAdapter = plainTextAdapterFactory.get(
        job
      ) as PlainTextAdapter;
      const result = await plainTextAdapter.fromDoc(this.store);
      return result?.file;
    } catch (error) {
      console.error('Failed to get plain text content', error);
      return '';
    }
  }

  private readonly _updateActiveContent = async () => {
    const activeId = this.activeAdapter.id;
    switch (activeId) {
      case 'markdown':
        this._context.markdownContent$.value =
          (await this._getMarkdownContent()) || '';
        break;
      case 'html':
        this._context.htmlContent$.value = (await this._getHtmlContent()) || '';
        break;
      case 'plaintext':
        this._context.plainTextContent$.value =
          (await this._getPlainTextContent()) || '';
        break;
      case 'snapshot':
        this._context.docSnapshot$.value = this._getDocSnapshot() || null;
        break;
    }
  };

  override connectedCallback() {
    super.connectedCallback();
    this._context = {
      activeAdapter$: signal(ADAPTERS[0]),
      isHtmlPreview$: signal(false),
      docSnapshot$: signal(null),
      htmlContent$: signal(''),
      markdownContent$: signal(''),
      plainTextContent$: signal(''),
    };
  }

  override willUpdate(changedProperties: PropertyValues<this>): void {
    if (changedProperties.has('store')) {
      this._updateActiveContent().catch(console.error);
    }
  }

  override firstUpdated() {
    this.disposables.add(
      effect(() => {
        if (this.activeAdapter) {
          this._updateActiveContent().catch(console.error);
        }
      })
    );
  }

  override render() {
    return html`
      <div class="adapters-container">
        <affine-adapter-panel-header
          .updateActiveContent=${this._updateActiveContent}
        ></affine-adapter-panel-header>
        <affine-adapter-panel-body></affine-adapter-panel-body>
      </div>
    `;
  }

  @property({ attribute: false })
  accessor store!: Store;

  @property({ attribute: false })
  accessor transformerMiddlewares: TransformerMiddleware[] = [];

  @provide({ context: adapterPanelContext })
  private accessor _context!: AdapterPanelContext;
}

declare global {
  interface HTMLElementTagNameMap {
    [AFFINE_ADAPTER_PANEL]: AdapterPanel;
  }
}
