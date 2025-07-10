import { track } from '@affine/track';
import { WidgetComponent, WidgetViewExtension } from '@blocksuite/affine/std';
import { unsafeCSSVar, unsafeCSSVarV2 } from '@blocksuite/affine-shared/theme';
import {
  ArrowDownSmallIcon,
  ArrowUpSmallIcon,
  CloseIcon,
  DoneIcon,
} from '@blocksuite/icons/lit';
import { css, html, nothing } from 'lit';
import { property } from 'lit/decorators.js';
import { literal, unsafeStatic } from 'lit/static-html.js';

import { BlockDiffProvider } from '../../services/block-diff';

export const AFFINE_BLOCK_DIFF_WIDGET_FOR_PAGE =
  'affine-block-diff-widget-for-page';

export class AffineBlockDiffWidgetForPage extends WidgetComponent {
  static override styles = css`
    .ai-block-diff-scroller-container {
      position: fixed;
      left: 50%;
      transform: translateX(-50%);
      bottom: 180px;
      margin: 0;
      display: flex;
      gap: 4px;
      justify-content: center;
      align-items: center;
      background-color: ${unsafeCSSVarV2('layer/background/overlayPanel')};
      box-shadow: ${unsafeCSSVar('shadow1')};
      border-radius: 8px;
      width: 350px;
      padding: 8px 4px;
      cursor: pointer;
    }

    .ai-block-diff-scroller {
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .ai-block-diff-scroller span {
      display: inline-flex;
    }

    .ai-block-diff-scroller svg {
      color: ${unsafeCSSVarV2('icon/primary')};
    }

    .ai-block-diff-all-option {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 4px 8px;
    }
  `;

  @property({ type: Number })
  accessor currentIndex = 0;

  _handleScroll(dir: 'prev' | 'next') {
    const total = this.diffService.getTotalDiffs();

    const diffWidgets = Array.from(
      this.std.host.querySelectorAll('affine-block-diff-widget-for-block')
    );
    const diffs = diffWidgets.reduce<Element[]>((acc, widget) => {
      const aiDiffs = widget.shadowRoot?.querySelectorAll('.ai-block-diff');
      if (aiDiffs && aiDiffs.length > 0) {
        acc.push(...aiDiffs);
      }
      return acc;
    }, []);
    if (dir === 'prev') {
      this.currentIndex = Math.max(0, this.currentIndex - 1);
    } else {
      this.currentIndex = Math.min(total - 1, this.currentIndex + 1);
    }
    diffs[this.currentIndex].scrollIntoView({ behavior: 'smooth' });
  }

  async _handleAcceptAll() {
    track.applyModel.widget.page.acceptAll();
    await this.diffService.acceptAll(this.std.store);
  }

  _handleRejectAll() {
    track.applyModel.widget.page.rejectAll();
    this.diffService.rejectAll();
  }

  get diffService() {
    return this.std.get(BlockDiffProvider);
  }

  override render() {
    if (!this.diffService.hasDiff()) {
      return nothing;
    }

    const total = this.diffService.getTotalDiffs();

    return total === 0
      ? null
      : html`
          <div class="ai-block-diff-scroller-container">
            <div class="ai-block-diff-scroller">
              <span @click=${() => this._handleScroll('next')}
                >${ArrowDownSmallIcon()}</span
              >
              <span class="ai-block-diff-scroller-current"
                >${Math.min(this.currentIndex + 1, total)}</span
              >
              <span>/</span>
              <span class="ai-block-diff-scroller-total">${total}</span>
              <span @click=${() => this._handleScroll('prev')}
                >${ArrowUpSmallIcon()}</span
              >
            </div>
            <div
              class="ai-block-diff-all-option"
              @click=${() => this._handleRejectAll()}
            >
              ${CloseIcon({
                style: `color: ${unsafeCSSVarV2('icon/secondary')}`,
              })}
              Reject all
            </div>
            <div
              class="ai-block-diff-all-option"
              @click=${() => this._handleAcceptAll()}
            >
              ${DoneIcon({
                style: `color: ${unsafeCSSVarV2('icon/activated')}`,
              })}
              Accept all
            </div>
          </div>
        `;
  }

  override connectedCallback() {
    super.connectedCallback();

    this.disposables.add(
      this.diffService.diffMap$.subscribe(() => {
        this.requestUpdate();
      })
    );

    this.disposables.add(
      this.diffService.rejects$.subscribe(() => {
        this.requestUpdate();
      })
    );
  }
}

export const blockDiffWidgetForPage = WidgetViewExtension(
  'affine:page',
  AFFINE_BLOCK_DIFF_WIDGET_FOR_PAGE,
  literal`${unsafeStatic(AFFINE_BLOCK_DIFF_WIDGET_FOR_PAGE)}`
);
