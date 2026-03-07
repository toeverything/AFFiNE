import { css, html,LitElement } from 'lit';
import { property } from 'lit/decorators.js';

/**
 * Renders an Obsidian-style inline tag element.
 *
 * Accessibility: role="link", tabindex="0", aria-label="Tag: {name}"
 * Interaction: click / Enter / Space → workspace search 'tag:{canonical-name}'
 *
 * Per contracts/inline-extensions.md §4.
 */
export class AffineTagInline extends LitElement {
  static override styles = css`
    :host {
      display: inline;
    }

    .affine-tag {
      display: inline;
      padding: 1px 4px;
      border-radius: 4px;
      background: var(--affine-tag-blue, rgba(64, 128, 255, 0.1));
      color: var(--affine-link-color, #1a6bc1);
      font-size: 0.95em;
      cursor: pointer;
      text-decoration: none;
      white-space: nowrap;
      /* Ensure non-text contrast ≥3:1 per WCAG SC 1.4.11 */
      outline-offset: 2px;
    }

    .affine-tag:focus-visible {
      outline: 2px solid var(--affine-primary-color, #1a6bc1);
      border-radius: 4px;
    }

    @media (forced-colors: active) {
      .affine-tag {
        border: 1px solid ButtonText;
        background: ButtonFace;
        color: ButtonText;
      }
    }
  `;

  @property({ attribute: false })
  accessor tagName = '';

  @property({ attribute: false })
  accessor displayText = '';

  private _handleClick() {
    this._openTagSearch();
  }

  private _handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      this._openTagSearch();
    }
  }

  private _openTagSearch() {
    // Opens workspace search filtered by tag:canonical-name per contracts §4.
    // The search query format is 'tag:{canonical-name}'.
    const canonicalName = this.tagName.toLowerCase();
    const event = new CustomEvent('affine-tag-clicked', {
      detail: { tagName: canonicalName, query: `tag:${canonicalName}` },
      bubbles: true,
      composed: true,
    });
    this.dispatchEvent(event);
  }

  override render() {
    const canonicalName = this.tagName.toLowerCase();
    const display = this.displayText || `#${canonicalName}`;
    return html`<span
      class="affine-tag"
      role="link"
      tabindex="0"
      aria-label="Tag: ${canonicalName}"
      @click=${this._handleClick}
      @keydown=${this._handleKeyDown}
      >${display}</span
    >`;
  }
}
