import type {
  LinkPreviewProvider,
  LinkPreviewResult,
} from '@blocksuite/affine-shared/services';
import { unsafeCSSVarV2 } from '@blocksuite/affine-shared/theme';
import { ToggleDownIcon, ToggleRightIcon } from '@blocksuite/icons/lit';
import { flip, offset, shift } from '@floating-ui/dom';
import { css, html, LitElement, nothing, type PropertyValues } from 'lit';
import { property, state } from 'lit/decorators.js';

import { createLitPortal } from '../portal';

export class LinkPreviewDetails extends LitElement {
  static override styles = css`
    :host {
      display: block;
      color: ${unsafeCSSVarV2('text/primary')};
      font: 13px/20px var(--affine-font-family);
    }
    :host([floating]) {
      position: absolute;
      right: 8px;
      bottom: 8px;
    }
    :host([floating]) button {
      background: ${unsafeCSSVarV2('layer/background/primary')};
      box-shadow: 0 0 0 1px ${unsafeCSSVarV2('layer/background/tertiary')};
    }
    .content.floating {
      margin: 0;
      width: min(360px, calc(100vw - 32px));
      box-sizing: border-box;
      box-shadow: var(--affine-menu-shadow);
    }
    button {
      display: flex;
      align-items: center;
      gap: 4px;
      border: 0;
      border-radius: 4px;
      padding: 4px 8px;
      background: transparent;
      color: ${unsafeCSSVarV2('text/secondary')};
      font: inherit;
      cursor: pointer;
    }
    button:hover {
      background: var(--affine-hover-color);
    }
    button:focus-visible {
      outline: 2px solid var(--affine-primary-color);
    }
    .content {
      color: inherit;
      margin-top: 4px;
      padding: 12px;
      border: 1px solid ${unsafeCSSVarV2('layer/background/tertiary')};
      border-radius: 8px;
      background: ${unsafeCSSVarV2('layer/background/primary')};
      max-height: 320px;
      overflow: auto;
      user-select: text;
      overflow-wrap: anywhere;
    }
    .meta,
    .status,
    time {
      color: ${unsafeCSSVarV2('text/secondary')};
    }
    .segment {
      margin-top: 8px;
    }
    .segment-text,
    .description {
      white-space: pre-wrap;
    }
    h4 {
      margin: 12px 0 4px;
      font: inherit;
      font-weight: 600;
    }
    time {
      margin-right: 8px;
      font-variant-numeric: tabular-nums;
    }
  `;

  @property({ attribute: false }) accessor url = '';
  @property({ type: Boolean, reflect: true }) accessor floating = false;
  @property({ attribute: false }) accessor provider!: LinkPreviewProvider;
  @state() private accessor open = false;
  @state() private accessor loading = false;
  @state() private accessor value: LinkPreviewResult | undefined;
  private controller?: AbortController;
  private popupController?: AbortController;
  private updatePopup?: () => void;

  protected override willUpdate(changed: PropertyValues) {
    if (changed.has('url') || changed.has('provider')) {
      this.controller?.abort();
      this.open = false;
      this.loading = false;
      this.value = undefined;
    }
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    this.popupController?.abort();
    this.controller?.abort();
    this.open = false;
    this.loading = false;
  }

  protected override updated() {
    if (!this.floating || !this.open) {
      this.popupController?.abort();
      return;
    }
    if (this.popupController) {
      this.updatePopup?.();
      return;
    }
    const button = this.shadowRoot?.querySelector('button');
    if (!button) return;
    const controller = new AbortController();
    this.popupController = controller;
    controller.signal.addEventListener('abort', () => {
      this.popupController = undefined;
      this.updatePopup = undefined;
      this.open = false;
    });
    document.addEventListener(
      'keydown',
      event => {
        if (event.key !== 'Escape') return;
        event.stopPropagation();
        controller.abort();
        button.focus();
      },
      { signal: controller.signal }
    );
    const { portal } = createLitPortal({
      template: ({ updatePortal }) => {
        this.updatePopup = updatePortal;
        return html`<style>
            ${LinkPreviewDetails.styles.cssText}</style
          >${this.renderContent()}`;
      },
      computePosition: {
        referenceElement: button,
        placement: 'bottom-end',
        middleware: [offset(8), flip(), shift({ padding: 16 })],
        autoUpdate: { animationFrame: true },
      },
      abortController: controller,
      positionStrategy: 'fixed',
      closeOnClickAway: true,
    });
    portal.shadowRoot?.querySelector<HTMLElement>('.content')?.focus();
  }

  private async toggle() {
    this.open = !this.open;
    if (!this.open || this.loading || this.value) return;
    const controller = new AbortController();
    this.controller = controller;
    this.loading = true;
    try {
      const value = await this.provider.query(this.url, controller.signal, [
        'transcript',
      ]);
      if (!controller.signal.aborted) this.value = value;
    } catch {
      if (!controller.signal.aborted) this.value = {};
    } finally {
      if (this.controller === controller) this.loading = false;
    }
  }

  override render() {
    return html`<div
      contenteditable="false"
      @click=${(event: Event) => event.stopPropagation()}
      @dblclick=${(event: Event) => event.stopPropagation()}
      @pointerdown=${(event: Event) => event.stopPropagation()}
    >
      <button
        type="button"
        aria-expanded=${this.open}
        aria-controls=${this.floating ? nothing : 'details'}
        aria-haspopup=${this.floating ? 'dialog' : nothing}
        @click=${this.toggle}
      >
        ${(this.open ? ToggleDownIcon : ToggleRightIcon)({ width: '16px', height: '16px' })}
        Details
      </button>
      ${this.open && !this.floating ? this.renderContent() : nothing}
    </div>`;
  }

  private renderContent() {
    const value = this.value;
    const transcript = value?.transcript;
    const metadata = [
      value?.author?.name,
      value?.publishedAt?.split('T')[0],
      value?.durationSeconds === undefined
        ? undefined
        : timestamp(value.durationSeconds),
    ].filter(Boolean);
    let chapterIndex = 0;
    const chapters = transcript?.chapters ?? [];
    return html`<div
      class="content ${this.floating ? 'floating' : ''}"
      id="details"
      contenteditable="false"
      aria-busy=${this.loading}
      role=${this.floating ? 'dialog' : 'region'}
      aria-label="Link details"
      tabindex="-1"
      @click=${(event: Event) => event.stopPropagation()}
      @dblclick=${(event: Event) => event.stopPropagation()}
      @pointerdown=${(event: Event) => event.stopPropagation()}
      @wheel=${(event: Event) => event.stopPropagation()}
    >
      ${
        this.loading
          ? html`<span class="status" role="status">Loading details…</span>`
          : html`
              ${metadata.length ? html`<div class="meta">${metadata.join(' · ')}</div>` : nothing}
              ${value?.description ? html`<p class="description">${value.description}</p>` : nothing}
              ${
                transcript?.segments.length
                  ? html`
                      <h4>Transcript</h4>
                      ${transcript.segments.map(segment => {
                        const headings = [];
                        while (
                          chapterIndex < chapters.length &&
                          chapters[chapterIndex].startSeconds <=
                            (segment.startSeconds ?? 0)
                        ) {
                          headings.push(
                            html`<h4>${chapters[chapterIndex++].title}</h4>`
                          );
                        }
                        return html`${headings}
                          <div class="segment">
                            ${segment.startSeconds === undefined ? nothing : html`<time>${timestamp(segment.startSeconds)}</time>`}${segment.speaker ? html`<strong>${segment.speaker}: </strong>` : nothing}<span
                              class="segment-text"
                              >${segment.text}</span
                            >
                          </div>`;
                      })}
                      ${transcript.truncated ? html`<p class="status">Transcript truncated by the preview service.</p>` : nothing}
                    `
                  : html`<div class="status">No transcript available.</div>`
              }
            `
      }
    </div>`;
  }
}

function timestamp(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${Math.floor(seconds % 60)
    .toString()
    .padStart(2, '0')}`;
}

declare global {
  interface HTMLElementTagNameMap {
    'affine-link-preview-details': LinkPreviewDetails;
  }
}
