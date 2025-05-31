import { InformationIcon } from '@blocksuite/icons/lit';
import type { PropertyValues, TemplateResult } from 'lit';
import { css, html, LitElement } from 'lit';
import { customElement, property } from 'lit/decorators.js';

const TIP_HEIGHT = 24;
@customElement('ai-chat-composer-tip')
export class AIChatComposerTip extends LitElement {
  static override styles = css`
    :host {
      display: block;
      min-height: 24px;
      position: relative;
      height: 24px;
      overflow: hidden;
    }
    .tip-list {
      display: flex;
      flex-direction: column;
      transition: margin-top 0.5s ease-in-out;
      will-change: margin-top;
    }
    .tip {
      width: 100%;
      height: ${TIP_HEIGHT}px;
      box-sizing: border-box;
      display: flex;
      align-items: center;
      justify-content: flex-start;
      gap: 4px;
    }
  `;

  @property({ attribute: false })
  accessor tips: TemplateResult[] = [];

  @property({ attribute: false })
  accessor loop: boolean = true;

  private readonly _interval = 5000;
  private readonly _animDuration = 500;
  private _tipIntervalId: number | null = null;
  private _tipListElement: HTMLDivElement | null = null;
  private _currentIndex: number = 0;

  override connectedCallback() {
    super.connectedCallback();
    this._startAutoScroll();
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    this._stopAutoScroll();
    if (this._tipListElement) {
      this._tipListElement.removeEventListener(
        'mouseenter',
        this._onMouseEnter
      );
      this._tipListElement.removeEventListener(
        'mouseleave',
        this._onMouseLeave
      );
    }
  }

  protected override firstUpdated() {
    this._tipListElement = this.renderRoot.querySelector('.tip-list');
    if (this._tipListElement) {
      this._tipListElement.addEventListener('mouseenter', this._onMouseEnter);
      this._tipListElement.addEventListener('mouseleave', this._onMouseLeave);
    }
  }

  protected override willUpdate(changed: PropertyValues<this>) {
    if (changed.has('tips')) {
      this._stopAutoScroll();
      this._startAutoScroll();
    }
  }

  private _startAutoScroll() {
    this._stopAutoScroll();
    if (!this.loop && this._currentIndex >= this.tips.length - 1) {
      return;
    }
    this._currentIndex = 0;
    this._tipIntervalId = window.setInterval(() => {
      this._scrollToNext();
    }, this._interval);
  }

  private _stopAutoScroll() {
    if (this._tipIntervalId) {
      clearInterval(this._tipIntervalId);
      this._tipIntervalId = null;
    }
  }

  private _scrollToNext() {
    if (this.tips.length <= 1 || !this._tipListElement) return;

    if (!this.loop && this._currentIndex >= this.tips.length - 1) {
      this._stopAutoScroll();
      return;
    }

    const list = this._tipListElement;
    const firstItem = list.firstElementChild as HTMLElement;

    if (!firstItem) return;

    // Set transition effect, smoothly move up by one item height
    list.style.transition = 'margin-top ' + this._animDuration + 'ms';
    list.style.marginTop = '-' + TIP_HEIGHT + 'px';

    setTimeout(() => {
      list.style.transition = 'none';
      if (this.loop) {
        list.append(firstItem);
        list.style.marginTop = '0';
        this._currentIndex++;
      } else {
        // Non-looping: only scroll if not at the last tip
        if (this._currentIndex < this.tips.length - 1) {
          list.append(firstItem);
          list.style.marginTop = '0';
          this._currentIndex++;
        } else {
          // When reaching the last tip, keep the position unchanged
          list.style.marginTop = '0';
        }
      }
    }, this._animDuration);
  }

  private readonly _onMouseEnter = (e: MouseEvent) => {
    e.stopPropagation();
    this._stopAutoScroll();
  };

  private readonly _onMouseLeave = (e: MouseEvent) => {
    e.stopPropagation();
    this._startAutoScroll();
  };

  override render() {
    return html`
      <div class="tip-list">
        ${this.tips.map(
          tip => html`<div class="tip">${InformationIcon()}${tip}</div>`
        )}
      </div>
    `;
  }
}
