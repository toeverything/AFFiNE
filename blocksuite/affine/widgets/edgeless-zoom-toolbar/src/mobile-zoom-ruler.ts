import { stopPropagation } from '@blocksuite/affine-shared/utils';
import { WithDisposable } from '@blocksuite/global/lit';
import { ViewBarIcon } from '@blocksuite/icons/lit';
import type { BlockStdScope } from '@blocksuite/std';
import { GfxControllerIdentifier } from '@blocksuite/std/gfx';
import { baseTheme } from '@toeverything/theme';
import { css, html, LitElement, unsafeCSS } from 'lit';
import { property } from 'lit/decorators.js';

/**
 * Compact zoom indicator for narrow / mobile edgeless viewports.
 * Shows the live zoom percentage and a fit-to-screen action in a pill HUD
 * anchored to the bottom-left of the canvas.
 */
export class MobileZoomRuler extends WithDisposable(LitElement) {
  static override styles = css`
    :host {
      display: flex;
      pointer-events: auto;
      font-family: ${unsafeCSS(baseTheme.fontSansFamily)};
    }

    .zoom-pill {
      display: flex;
      align-items: center;
      height: 32px;
      background: var(--affine-background-overlay-panel-color);
      border: 1px solid var(--affine-border-color);
      border-radius: 999px;
      box-shadow: var(--affine-shadow-1);
      overflow: hidden;
    }

    .zoom-label {
      display: flex;
      align-items: center;
      justify-content: center;
      min-width: 44px;
      padding: 0 12px;
      font-size: 12px;
      font-weight: 500;
      line-height: 1;
      color: var(--affine-text-secondary-color);
      white-space: nowrap;
      user-select: none;
    }

    .divider {
      width: 1px;
      height: 16px;
      background: var(--affine-border-color);
      flex-shrink: 0;
    }

    .fit-button {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 36px;
      height: 100%;
      padding: 0;
      border: none;
      background: transparent;
      color: var(--affine-icon-color);
      cursor: pointer;
    }

    .fit-button:hover:not(:disabled) {
      background: var(--affine-hover-color);
      color: var(--affine-primary-color);
    }

    .fit-button:disabled {
      cursor: not-allowed;
      color: var(--affine-text-disable-color);
    }

    .fit-button svg {
      width: 20px;
      height: 20px;
    }
  `;

  get gfx() {
    return this.std.get(GfxControllerIdentifier);
  }

  get viewport() {
    return this.gfx.viewport;
  }

  get zoom() {
    if (!this.viewport) {
      return 1;
    }
    return this.viewport.zoom;
  }

  override firstUpdated() {
    const { disposables } = this;
    const viewport = this.viewport;
    if (!viewport) {
      return;
    }
    disposables.add(
      viewport.viewportUpdated.subscribe(() => this.requestUpdate())
    );
    disposables.add(viewport.zoomUpdated.subscribe(() => this.requestUpdate()));
  }

  override render() {
    const formattedZoom = `${Math.round(this.zoom * 100)}%`;
    const locked = this.viewport?.locked || this.std.store.readonly;

    return html`
      <div
        class="zoom-pill"
        @dblclick=${stopPropagation}
        @mousedown=${stopPropagation}
        @mouseup=${stopPropagation}
        @pointerdown=${stopPropagation}
      >
        <span class="zoom-label">${formattedZoom}</span>
        <span class="divider"></span>
        <button
          class="fit-button"
          aria-label="Fit to screen"
          ?disabled=${locked}
          @click=${() => this.gfx.fitToScreen()}
        >
          ${ViewBarIcon()}
        </button>
      </div>
    `;
  }

  @property({ attribute: false })
  accessor std!: BlockStdScope;
}
