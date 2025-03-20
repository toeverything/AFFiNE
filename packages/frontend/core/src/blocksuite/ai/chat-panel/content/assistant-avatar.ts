import { ShadowlessElement } from '@blocksuite/affine/block-std';
import { AiIcon } from '@blocksuite/icons/lit';
import { css, html } from 'lit';

const AffineAvatarIcon = AiIcon({
  width: '20px',
  height: '20px',
  style: 'color: var(--affine-primary-color)',
});

export class AssistantAvatar extends ShadowlessElement {
  static override styles = css`
    .assistant-avatar {
      display: inline-flex;
      align-items: center;
      gap: 8px;
    }
  `;
  protected override render() {
    return html`<span class="assistant-avatar"
      >${AffineAvatarIcon} AFFiNE AI</span
    >`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'chat-assistant-avatar': AssistantAvatar;
  }
}
