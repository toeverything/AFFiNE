import { LoadingIcon } from '@blocksuite/affine/components/icons';
import { SignalWatcher, WithDisposable } from '@blocksuite/affine/global/lit';
import type { ColorScheme } from '@blocksuite/affine/model';
import { ShadowlessElement } from '@blocksuite/affine/std';
import { unsafeCSSVar, unsafeCSSVarV2 } from '@blocksuite/affine-shared/theme';
import type { Signal } from '@preact/signals-core';
import {
  css,
  html,
  nothing,
  type PropertyValues,
  type TemplateResult,
} from 'lit';
import { property } from 'lit/decorators.js';

import {
  isPreviewPanelOpen,
  renderPreviewPanel,
} from './artifacts-preview-panel';

/**
 * Base web-component for AI artifact tools.
 * It encapsulates common reactive properties (data/std/width/…)
 * and automatically calls `updatePreviewPanel()` when the `data`
 * property changes while the preview panel is open.
 */
export abstract class ArtifactTool<
  TData extends { type: 'tool-result' | 'tool-call' },
> extends SignalWatcher(WithDisposable(ShadowlessElement)) {
  static override styles = css`
    .artifact-tool-card {
      margin: 8px 0;
      padding: 10px 0;

      .affine-embed-linked-doc-block {
        box-shadow: ${unsafeCSSVar('buttonShadow')};
        cursor: pointer;
      }

      .affine-embed-linked-doc-block:hover {
        background-color: ${unsafeCSSVarV2('layer/background/hoverOverlay')};
      }
    }

    .artifact-skeleton-container {
      display: flex;
      justify-content: center;
      align-items: center;
      height: 100%;

      artifact-skeleton {
        margin-top: -24px;
      }
    }
  `;

  /** Tool data coming from ChatGPT (tool-call / tool-result). */
  @property({ attribute: false })
  accessor data!: TData;

  @property({ attribute: false })
  accessor theme!: Signal<ColorScheme>;

  /* -------------------------- Card meta hooks -------------------------- */

  /**
   * Sub-class must provide primary information for the card.
   */
  protected abstract getCardMeta(): {
    title: string;
    /** Extra css class appended to card root */
    className?: string;
  };

  /**
   * Icon shown in the card (when not loading) and in the loading skeleton.
   */
  protected abstract getIcon(): TemplateResult | HTMLElement | string | null;

  /** Banner shown on the right side of the card (can be undefined). */
  protected abstract getBanner(
    theme: ColorScheme
  ): TemplateResult | HTMLElement | string | null | undefined;

  /**
   * Provide the main TemplateResult shown in the preview panel.
   * Called each time the panel opens or the tool data updates.
   */
  protected abstract getPreviewContent(): TemplateResult<1>;

  /** Provide the action controls (right-side buttons) for the panel. */
  protected getPreviewControls(): TemplateResult<1> | undefined {
    return undefined;
  }

  /** Open or refresh the preview panel. */
  private openOrUpdatePreviewPanel() {
    const content = this.isLoading()
      ? this.renderLoadingSkeleton()
      : this.getPreviewContent();
    renderPreviewPanel(this, content, this.getPreviewControls());
  }

  protected isLoading(): boolean {
    return this.data.type !== 'tool-result';
  }

  protected refreshPreviewPanel() {
    if (isPreviewPanelOpen(this)) {
      this.openOrUpdatePreviewPanel();
    }
  }

  /** Optionally override to show an error card. Return null if no error. */
  protected getErrorTemplate(): TemplateResult | null {
    return null;
  }

  protected renderLoadingSkeleton() {
    const icon = this.getIcon();
    return html`<div class="artifact-skeleton-container">
      <artifact-skeleton .icon=${icon}></artifact-skeleton>
    </div>`;
  }

  private readonly onCardClick = (_e: Event) => {
    this.openOrUpdatePreviewPanel();
  };

  protected renderCard() {
    const { title, className } = this.getCardMeta();

    const resolvedIcon = this.isLoading()
      ? LoadingIcon({ size: '20px' })
      : this.getIcon();

    const banner = this.getBanner(this.theme.value);

    return html`
      <div
        class="artifact-tool-card ${className ?? ''}"
        @click=${this.onCardClick}
      >
        <div class="affine-embed-linked-doc-block horizontal">
          <div class="affine-embed-linked-doc-content">
            <div class="affine-embed-linked-doc-content-title">
              <div class="affine-embed-linked-doc-content-title-icon">
                ${resolvedIcon}
              </div>
              <div class="affine-embed-linked-doc-content-title-text">
                ${title}
              </div>
            </div>
          </div>
          ${banner
            ? html`<div class="affine-embed-linked-doc-banner">${banner}</div>`
            : nothing}
        </div>
      </div>
    `;
  }

  override connectedCallback() {
    super.connectedCallback();
    // open the preview panel immediately
    this.openOrUpdatePreviewPanel();
  }

  override render() {
    const err = this.getErrorTemplate();
    if (err) {
      return err;
    }
    return this.renderCard();
  }

  override updated(changed: PropertyValues<this>) {
    super.updated(changed);
    if (changed.has('data') && isPreviewPanelOpen(this)) {
      this.openOrUpdatePreviewPanel();
    }
  }
}
