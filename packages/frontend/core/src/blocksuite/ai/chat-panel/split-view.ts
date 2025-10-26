import { SignalWatcher, WithDisposable } from '@blocksuite/affine/global/lit';
import { ShadowlessElement } from '@blocksuite/std';
import {
  css,
  html,
  nothing,
  type PropertyValues,
  type TemplateResult,
} from 'lit';
import { property, query, state } from 'lit/decorators.js';

export class ChatPanelSplitView extends SignalWatcher(
  WithDisposable(ShadowlessElement)
) {
  static override styles = css`
    .ai-chat-panel-split-view {
      --gap: 0px;
      --drag-size: 10px;
      display: flex;
      align-items: stretch;
      height: 100%;
    }
    .ai-chat-panel-split-view[data-dragging='true'] {
      cursor: col-resize;
    }
    .ai-chat-panel-split-view-right {
      position: relative;
    }
    .ai-chat-panel-split-view-left,
    .ai-chat-panel-split-view-right,
    .ai-chat-panel-split-view-divider {
      flex-shrink: 0;
      flex-grow: 0;
    }
    .ai-chat-panel-split-view-left,
    .ai-chat-panel-split-view-right {
      transition: width 0.23s ease;
    }
    .ai-chat-panel-split-view[data-dragging='true']
      .ai-chat-panel-split-view-left,
    .ai-chat-panel-split-view[data-dragging='true']
      .ai-chat-panel-split-view-right {
      transition: none;
    }
    .ai-chat-panel-split-view-divider {
      width: var(--gap);
      position: relative;
    }
    .ai-chat-panel-split-view[data-open='false']
      .ai-chat-panel-split-view-divider {
      width: 0;
      visibility: hidden;
      pointer-events: none;
    }
    .ai-chat-panel-split-view-divider-handle {
      width: var(--drag-size);
      height: 100%;
      position: absolute;
      top: 0;
      left: calc((var(--drag-size) - var(--gap)) / 2 * -1);
      cursor: col-resize;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .ai-chat-panel-split-view-divider-handle::after {
      content: '';
      width: 2px;
      height: 100%;
      background-color: var(--affine-v2-button-primary);
      opacity: 0;
      transition:
        opacity 0.23s ease,
        width 0.23s ease;
    }
    .ai-chat-panel-split-view[data-dragging='true']
      .ai-chat-panel-split-view-divider-handle::after {
      width: 4px;
      opacity: 1;
    }
    .ai-chat-panel-split-view-divider-handle:hover::after {
      opacity: 1;
    }
  `;

  @property({ attribute: false })
  accessor minWidthPercent: number = 20;

  @property({ attribute: false })
  accessor open: boolean = false;

  @property({ attribute: false })
  accessor left: TemplateResult<1> | null = null;

  @property({ attribute: false })
  accessor right: TemplateResult<1> | null = null;

  @query('.ai-chat-panel-split-view-divider-handle')
  private accessor _handle!: HTMLElement;

  @query('.ai-chat-panel-split-view-left')
  private accessor _left!: HTMLElement;

  @query('.ai-chat-panel-split-view-right')
  private accessor _right!: HTMLElement;

  @state()
  accessor isDragging = false;

  @state()
  accessor isTransitioning = false;

  private readonly _storeKey = 'chat-panel-split-view-size';

  private _getInitialSize() {
    try {
      const last = localStorage.getItem(this._storeKey);
      return last ? Number.parseInt(last) : 50;
    } catch {
      return 50;
    }
  }

  private _setInitialSize(size: number) {
    try {
      localStorage.setItem(this._storeKey, size.toString());
    } catch {
      console.error('Failed to set initial size');
    }
  }

  private _percent = this._getInitialSize();
  private _initialBox: DOMRect | null = null;
  private _initialX: number | null = null;
  private _initialPercent: number | null = null;
  private _rafId: number | null = null;

  private _onDragStart(x: number) {
    this.isDragging = true;
    this._initialBox = this.getBoundingClientRect();
    this._initialX = x;
    this._initialPercent = this._percent;
  }
  private _onDragMove(x: number) {
    const offset = x - (this._initialX || 0);
    const offsetPercent = (offset / (this._initialBox?.width || 1)) * 100;

    this._percent = Math.max(
      this.minWidthPercent,
      Math.min(
        100 - this.minWidthPercent,
        Number(((this._initialPercent || 0) + offsetPercent).toFixed(0))
      )
    );
    this._updateSize();
  }
  private _onDragEnd() {
    this.isDragging = false;
    this._setInitialSize(this._percent);
  }

  private _updateSize() {
    if (this._rafId) {
      cancelAnimationFrame(this._rafId);
    }
    this._rafId = requestAnimationFrame(() => {
      if (this.open && this._left && this._right) {
        const leftPercent = this._percent;
        const rightPercent = 100 - leftPercent;
        this._left.style.width = `${leftPercent}%`;
        this._right.style.width = `${rightPercent}%`;
      }

      if (!this.open && this._left) {
        this._left.style.width = '100%';
      }
    });
  }

  override firstUpdated(changed: PropertyValues) {
    super.firstUpdated(changed);
    if (this._left) {
      this.disposables.addFromEvent(this._left, 'transitionstart', () => {
        this.isTransitioning = true;
      });
      this.disposables.addFromEvent(this._left, 'transitionend', () => {
        this.isTransitioning = false;
      });
    }

    if (this._handle) {
      // mouse
      let onMouseMove = (e: MouseEvent) => {
        this._onDragMove(e.clientX);
      };
      const onMouseUp = () => {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        this._onDragEnd();
      };
      this.disposables.addFromEvent(this._handle, 'mousedown', e => {
        e.stopPropagation();
        e.preventDefault();
        this._onDragStart(e.clientX);
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
      });

      // touch
      let onTouchMove = (e: TouchEvent) => {
        this._onDragMove(e.touches[0].clientX);
      };
      const onTouchEnd = () => {
        document.removeEventListener('touchmove', onTouchMove);
        document.removeEventListener('touchend', onTouchEnd);
        this._onDragEnd();
      };
      this.disposables.addFromEvent(this._handle, 'touchstart', e => {
        e.stopPropagation();
        e.preventDefault();
        this._onDragStart(e.touches[0].clientX);
        document.addEventListener('touchmove', onTouchMove);
        document.addEventListener('touchend', onTouchEnd);
      });
    }
  }

  override updated(changed: PropertyValues) {
    super.updated(changed);
    if (changed.has('open')) {
      this._updateSize();
    }
  }

  override render() {
    return html`<div
      class="ai-chat-panel-split-view"
      data-open=${this.open}
      data-dragging=${this.isDragging}
    >
      <div class="ai-chat-panel-split-view-left">${this.left}</div>
      <div class="ai-chat-panel-split-view-divider">
        <div class="ai-chat-panel-split-view-divider-handle"></div>
      </div>
      ${this.open || this.isTransitioning
        ? html` <div class="ai-chat-panel-split-view-right">${this.right}</div>`
        : nothing}
    </div>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'chat-panel-split-view': ChatPanelSplitView;
  }
}
