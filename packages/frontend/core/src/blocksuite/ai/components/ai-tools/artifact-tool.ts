import { LoadingIcon } from '@blocksuite/affine/components/icons';
import { SignalWatcher, WithDisposable } from '@blocksuite/affine/global/lit';
import type { ImageProxyService } from '@blocksuite/affine/shared/adapters';
import { type BlockStdScope, ShadowlessElement } from '@blocksuite/affine/std';
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
      cursor: pointer;
      margin: 8px 0;
    }

    .artifact-tool-card:hover {
      background-color: var(--affine-hover-color);
    }
  `;

  /** Tool data coming from ChatGPT (tool-call / tool-result). */
  @property({ attribute: false })
  accessor data!: TData;

  @property({ attribute: false })
  accessor width: Signal<number | undefined> | undefined;

  @property({ attribute: false })
  accessor imageProxyService: ImageProxyService | null | undefined;

  @property({ attribute: false })
  accessor std: BlockStdScope | undefined;

  /* -------------------------- Card meta hooks -------------------------- */

  /**
   * Sub-class must provide primary information for the card.
   */
  protected abstract getCardMeta(): {
    title: string;
    /** Page / file icon shown when not loading */
    icon: TemplateResult | HTMLElement | string | null;
    /** Whether the spinner should be displayed */
    loading: boolean;
    /** Extra css class appended to card root */
    className?: string;
  };

  /** Banner shown on the right side of the card (can be undefined). */
  protected abstract getBanner():
    | TemplateResult
    | HTMLElement
    | string
    | null
    | undefined;

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
    renderPreviewPanel(
      this,
      this.getPreviewContent(),
      this.getPreviewControls()
    );
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

  private readonly onCardClick = (_e: Event) => {
    this.openOrUpdatePreviewPanel();
  };

  protected renderCard() {
    const { title, icon, loading, className } = this.getCardMeta();

    const resolvedIcon = loading
      ? LoadingIcon({
          size: '20px',
        })
      : icon;

    const banner = this.getBanner();

    return html`
      <div
        class="affine-embed-linked-doc-block artifact-tool-card ${className ??
        ''} horizontal"
        @click=${this.onCardClick}
      >
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
    `;
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
