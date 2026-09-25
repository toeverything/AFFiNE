import { unsafeCSSVarV2 } from '@blocksuite/affine-shared/theme';
import { SignalWatcher, WithDisposable } from '@blocksuite/global/lit';
import { ShadowlessElement } from '@blocksuite/std';
import { signal } from '@preact/signals-core';
import { css, html, type PropertyValues } from 'lit';
import { property, query } from 'lit/decorators.js';

import {
  buildDrawioViewerUrl,
  DEFAULT_DRAWIO_EMBED_URL,
  isDrawioXml,
  parseDrawioMessage,
} from './utils';

type ViewerState =
  | { kind: 'loading' }
  | { kind: 'ready' }
  | { kind: 'error'; message: string; retryable: boolean };

const LOAD_TIMEOUT = 20_000;

export class DrawioViewer extends SignalWatcher(
  WithDisposable(ShadowlessElement)
) {
  static override styles = css`
    affine-attachment-drawio-viewer {
      position: relative;
      display: block;
      width: 100%;
      height: 100%;
      min-height: 480px;
      border-radius: 8px;
      overflow: hidden;
      background-color: ${unsafeCSSVarV2('layer/background/primary')};
      border: 1px solid ${unsafeCSSVarV2('layer/insideBorder/border')};
      box-sizing: border-box;
    }

    affine-attachment-drawio-viewer iframe {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      border: none;
    }

    affine-attachment-drawio-viewer iframe.hidden {
      visibility: hidden;
    }

    .affine-drawio-viewer-overlay {
      position: absolute;
      inset: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 16px;
      text-align: center;
      font-size: 14px;
      color: ${unsafeCSSVarV2('text/secondary')};
    }

    .affine-drawio-viewer-overlay button {
      padding: 4px 12px;
      border-radius: 8px;
      border: 1px solid ${unsafeCSSVarV2('layer/insideBorder/border')};
      background: transparent;
      color: ${unsafeCSSVarV2('text/primary')};
      font-size: 14px;
      cursor: pointer;
    }

    /*
     * Keeps pointer events on the block until it's selected, so the diagram
     * can be selected, dragged and scrolled past like other blocks. In edgeless
     * the mask always stays, as the iframe would swallow canvas gestures.
     */
    .affine-drawio-viewer-mask {
      position: absolute;
      inset: 0;
    }

    affine-attachment
      .affine-attachment-container.focused
      .affine-drawio-viewer-mask {
      display: none;
    }
  `;

  private readonly state$ = signal<ViewerState>({ kind: 'loading' });

  private readonly xml$ = signal<string | null>(null);

  private timeout: ReturnType<typeof setTimeout> | null = null;

  private get viewerUrl() {
    return buildDrawioViewerUrl(this.embedUrl);
  }

  private get viewerOrigin() {
    return new URL(this.embedUrl).origin;
  }

  private readonly onMessage = (event: MessageEvent) => {
    if (!this.iframe || event.source !== this.iframe.contentWindow) return;
    if (event.origin !== this.viewerOrigin) return;
    const message = parseDrawioMessage(event.data);
    if (!message) return;

    if (message.event === 'init') {
      const xml = this.xml$.peek();
      if (xml == null) return;
      this.iframe.contentWindow?.postMessage(
        JSON.stringify({ action: 'load', xml, autosave: 0, title: this.name }),
        this.viewerOrigin
      );
      this.clearLoadTimeout();
      this.state$.value = { kind: 'ready' };
    }
  };

  override connectedCallback() {
    super.connectedCallback();
    this.disposables.addFromEvent(window, 'message', this.onMessage);
    this.disposables.add(() => this.clearLoadTimeout());
  }

  protected override willUpdate(changed: PropertyValues<this>) {
    if (changed.has('blobUrl') || changed.has('embedUrl')) {
      this.load().catch(console.error);
    }
  }

  private clearLoadTimeout() {
    if (this.timeout) {
      clearTimeout(this.timeout);
      this.timeout = null;
    }
  }

  private async load() {
    this.clearLoadTimeout();
    this.xml$.value = null;
    this.state$.value = { kind: 'loading' };
    const blobUrl = this.blobUrl;
    if (!blobUrl) return;

    let content: string;
    try {
      content = await (await fetch(blobUrl)).text();
    } catch (error) {
      console.error(error);
      this.state$.value = {
        kind: 'error',
        message: 'Failed to read the diagram file.',
        retryable: true,
      };
      return;
    }
    // A newer blob may have started loading in the meantime.
    if (blobUrl !== this.blobUrl) return;

    if (!isDrawioXml(content)) {
      this.state$.value = {
        kind: 'error',
        message: 'This file is not a draw.io diagram.',
        retryable: false,
      };
      return;
    }

    this.xml$.value = content;
    this.timeout = setTimeout(() => {
      this.state$.value = {
        kind: 'error',
        message: `Couldn't load the draw.io viewer from ${this.viewerOrigin}.`,
        retryable: true,
      };
    }, LOAD_TIMEOUT);
  }

  private readonly retry = (event: MouseEvent) => {
    event.stopPropagation();
    this.load().catch(console.error);
  };

  private renderOverlay() {
    const state = this.state$.value;
    if (state.kind === 'ready') return null;
    if (state.kind === 'loading') {
      return html`<div class="affine-drawio-viewer-overlay">
        Loading diagram…
      </div>`;
    }
    return html`<div
      class="affine-drawio-viewer-overlay"
      data-testid="drawio-viewer-error"
    >
      <div>${state.message}</div>
      ${
        state.retryable
          ? html`<button @click=${this.retry}>Retry</button>`
          : null
      }
    </div>`;
  }

  override render() {
    const state = this.state$.value;
    return html`
      ${
        this.xml$.value != null && state.kind !== 'error'
          ? html`<iframe
              class=${state.kind === 'ready' ? '' : 'hidden'}
              src=${this.viewerUrl}
              title=${this.name || 'draw.io diagram'}
              sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
              referrerpolicy="no-referrer"
              loading="lazy"
              credentialless
            ></iframe>`
          : null
      }
      ${this.renderOverlay()}
      <div class="affine-drawio-viewer-mask"></div>
    `;
  }

  @property({ attribute: false })
  accessor blobUrl = '';

  @property({ attribute: false })
  accessor embedUrl = DEFAULT_DRAWIO_EMBED_URL;

  @query('iframe')
  accessor iframe!: HTMLIFrameElement | null;

  @property({ attribute: false })
  accessor name = '';
}

declare global {
  interface HTMLElementTagNameMap {
    'affine-attachment-drawio-viewer': DrawioViewer;
  }
}
