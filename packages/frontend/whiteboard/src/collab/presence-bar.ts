import { I18n } from '@affine/i18n';
import { css, html, LitElement, nothing } from 'lit';
import { property } from 'lit/decorators.js';
import { repeat } from 'lit/directives/repeat.js';

import type { WhiteboardPeer } from './protocol';

export class WhiteboardPresenceBar extends LitElement {
  static override styles = css`
    :host {
      position: fixed;
      top: 12px;
      right: 12px;
      z-index: 21;
      font: 12px/1.4 var(--affine-font-family, sans-serif);
    }

    .wb-presence {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 8px;
      border-radius: 8px;
      border: 1px solid var(--affine-border-color);
      background: var(--affine-background-overlay-panel-color);
      box-shadow: var(--affine-shadow-1);
    }

    .wb-presence__peer {
      width: 28px;
      height: 28px;
      border-radius: 50%;
      border: 2px solid transparent;
      color: #fff;
      font-weight: 600;
      cursor: pointer;
    }

    .wb-presence__peer[data-following='true'] {
      border-color: var(--affine-primary-color);
    }

    .wb-presence__label {
      color: var(--affine-text-secondary-color);
      max-width: 180px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .wb-presence__btn {
      border: 0;
      border-radius: 6px;
      padding: 4px 8px;
      background: var(--affine-background-tertiary-color);
      color: var(--affine-text-primary-color);
      cursor: pointer;
    }
  `;

  @property({ attribute: false })
  accessor peers: WhiteboardPeer[] = [];

  @property({ attribute: false })
  accessor following: number | null = null;

  @property({ attribute: false })
  accessor onFollow: ((clientId: number | null) => void) | undefined;

  @property({ attribute: false })
  accessor onAttention: (() => void) | undefined;

  private initials(name: string) {
    return name.slice(0, 1).toUpperCase();
  }

  override render() {
    const followed = this.peers.find(peer => peer.clientId === this.following);
    return html`
      <div class="wb-presence" data-wb-presence>
        ${repeat(
          this.peers,
          peer => peer.clientId,
          peer => html`
            <button
              type="button"
              class="wb-presence__peer"
              style="background:${peer.color}"
              data-following=${peer.clientId === this.following}
              title=${peer.editing
                ? I18n['com.affine.whiteboard.collab.editing']({
                    name: peer.name,
                  })
                : I18n['com.affine.whiteboard.collab.follow']({
                    name: peer.name,
                  })}
              @click=${() =>
                this.onFollow?.(
                  this.following === peer.clientId ? null : peer.clientId
                )}
            >
              ${this.initials(peer.name)}
            </button>
          `
        )}
        ${followed
          ? html`<span class="wb-presence__label">
              ${I18n['com.affine.whiteboard.collab.following']({
                name: followed.name,
              })}
            </span>`
          : nothing}
        <button
          type="button"
          class="wb-presence__btn"
          @click=${() => this.onAttention?.()}
        >
          ${I18n['com.affine.whiteboard.collab.look-here']()}
        </button>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'wb-presence-bar': WhiteboardPresenceBar;
  }
}
