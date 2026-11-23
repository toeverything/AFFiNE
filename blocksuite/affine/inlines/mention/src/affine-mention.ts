import { UserProvider } from '@blocksuite/affine-shared/services';
import { unsafeCSSVarV2 } from '@blocksuite/affine-shared/theme';
import type { AffineTextAttributes } from '@blocksuite/affine-shared/types';
import { SignalWatcher, WithDisposable } from '@blocksuite/global/lit';
import type { BlockStdScope } from '@blocksuite/std';
import { ShadowlessElement } from '@blocksuite/std';
import {
  ZERO_WIDTH_FOR_EMBED_NODE,
  ZERO_WIDTH_FOR_EMPTY_LINE,
} from '@blocksuite/std/inline';
import type { DeltaInsert } from '@blocksuite/store';
import { css, html } from 'lit';
import { property } from 'lit/decorators.js';

export class AffineMention extends SignalWatcher(
  WithDisposable(ShadowlessElement)
) {
  static override styles = css`
    .affine-mention {
      color: ${unsafeCSSVarV2('text/primary')};
      font-feature-settings:
        'liga' off,
        'clig' off;
      /* Client/baseMedium */
      font-family: Inter;
      font-size: var(--affine-font-size-base);
      font-style: normal;
      font-weight: 500;
      line-height: 24px; /* 160% */
      padding: 0 4px;
      border-radius: 4px;
      user-select: none;
    }
    .affine-mention:hover {
      background: var(--affine-hover-color);
    }
    .affine-mention[data-selected='true'] {
      background: var(--affine-hover-color);
    }
    .affine-mention[data-type='default'] {
      color: ${unsafeCSSVarV2('text/primary')};
    }
    .affine-mention[data-type='removed'] {
      color: ${unsafeCSSVarV2('text/disable')};
    }
    .affine-mention[data-type='error'] {
      color: ${unsafeCSSVarV2('text/disable')};
    }
    .affine-mention[data-type='loading'] {
      color: ${unsafeCSSVarV2('text/placeholder')};
      background: ${unsafeCSSVarV2('skeleton/skeleton')};
    }
    .loading-text {
      display: inline-block;
    }
    .dots {
      display: inline-block;
    }
    .dot {
      display: inline-block;
      opacity: 0;
      animation: pulse 1.2s infinite;
    }
    .dots > .dot:nth-child(2) {
      animation-delay: 0.4s;
    }
    .dots > .dot:nth-child(3) {
      animation-delay: 0.8s;
    }
    @keyframes pulse {
      0% {
        opacity: 0;
      }
      33.333% {
        opacity: 1;
      }
      66.666% {
        opacity: 1;
      }
      100% {
        opacity: 0;
      }
    }
  `;

  override render() {
    const errorContent = html`<span
      data-selected=${this.selected}
      data-type="error"
      class="affine-mention"
      >@Unknown Member<v-text .str=${ZERO_WIDTH_FOR_EMBED_NODE}></v-text
    ></span>`;

    const userService = this.std.getOptional(UserProvider);
    const memberId = this.delta.attributes?.mention?.member;
    if (!userService || !memberId) {
      return errorContent;
    }

    userService.revalidateUserInfo(memberId);
    const isLoading$ = userService.isLoading$(memberId);
    const userInfo$ = userService.userInfo$(memberId);

    if (userInfo$.value) {
      if (userInfo$.value.removed) {
        return html`<span
          data-selected=${this.selected}
          data-type="removed"
          class="affine-mention"
          >@Inactive Member<v-text .str=${ZERO_WIDTH_FOR_EMBED_NODE}></v-text
        ></span>`;
      } else {
        return html`<span
          data-selected=${this.selected}
          data-type="default"
          class="affine-mention"
          >@${userInfo$.value.name ?? 'Unknown'}<v-text
            .str=${ZERO_WIDTH_FOR_EMBED_NODE}
          ></v-text
        ></span>`;
      }
    }

    if (isLoading$.value) {
      return html`<span
        data-selected=${this.selected}
        data-type="loading"
        class="affine-mention"
        >@loading<span class="dots"
          ><span class="dot">.</span><span class="dot">.</span
          ><span class="dot">.</span></span
        ><v-text .str=${ZERO_WIDTH_FOR_EMBED_NODE}></v-text
      ></span>`;
    }

    return errorContent;
  }

  @property({ type: Object })
  accessor delta: DeltaInsert<AffineTextAttributes> = {
    insert: ZERO_WIDTH_FOR_EMPTY_LINE,
    attributes: {},
  };

  @property({ type: Boolean })
  accessor selected = false;

  @property({ attribute: false })
  accessor std!: BlockStdScope;
}
