import { baseTheme } from '@toeverything/theme';
import { css, html, LitElement, type TemplateResult, unsafeCSS } from 'lit';
import { property } from 'lit/decorators.js';

import type {
  MessageRole,
  MessageUserInfo,
} from '../../../components/ai-chat-messages';
import { AffineAIIcon } from './icon';

export class UserInfo extends LitElement {
  static override styles = css`
    .user-info-container {
      display: flex;
      width: 100%;
      height: 24px;
      flex-direction: row;
      gap: 10px;
      font-weight: 500;

      .user-avatar-container {
        width: 24px;
        height: 24px;
        color: var(--affine-brand-color);
        display: flex;
        justify-content: center;
        align-items: center;
      }

      .default-avatar,
      .user-avatar-container img {
        width: 100%;
        height: 100%;
        border-radius: 50%;
      }

      .user-avatar-container img {
        object-fit: cover;
      }

      .default-avatar,
      .avatar-image {
        background-color: var(--affine-primary-color);
      }

      .user-name {
        color: var(--affine-text-primary-color);
        text-align: justify;
        font-family: ${unsafeCSS(baseTheme.fontSansFamily)};
        font-size: var(--affine-font-sm);
        font-style: normal;
        font-weight: 500;
        line-height: 22px;
        text-overflow: ellipsis;
      }
    }
  `;

  private _handleAvatarLoadError(e: Event) {
    const target = e.target as HTMLImageElement;
    target.onerror = null;
    this.avatarLoadedFailed = true;
  }

  override render() {
    return html`<div class="user-info-container">
      <div class="user-avatar-container">
        ${this.avatarIcon
          ? this.avatarIcon
          : this.avatarUrl && !this.avatarLoadedFailed
            ? html`<img
                .src=${this.avatarUrl}
                @error=${this._handleAvatarLoadError}
              />`
            : html`<span class="default-avatar"></span>`}
      </div>
      <span class="user-name">${this.userName}</span>
    </div>`;
  }

  @property({ attribute: false })
  accessor avatarIcon: TemplateResult<1> | undefined = undefined;

  @property({ attribute: false })
  accessor avatarLoadedFailed = false;

  @property({ attribute: false })
  accessor avatarUrl: string | undefined = undefined;

  @property({ attribute: false })
  accessor userName!: string;
}

declare global {
  interface HTMLElementTagNameMap {
    'user-info': UserInfo;
  }
}

export function UserInfoTemplate(
  userInfo: MessageUserInfo,
  messageRole?: MessageRole
) {
  const isUser = !!messageRole && messageRole === 'user';

  const userInfoTemplate = isUser
    ? html`<user-info
        .userName=${userInfo.userName ?? 'You'}
        .avatarUrl=${userInfo.avatarUrl}
      ></user-info>`
    : html`<user-info
        .userName=${'AFFiNE AI'}
        .avatarIcon=${AffineAIIcon}
      ></user-info>`;

  return userInfoTemplate;
}
