import { LINE_WIDTHS, LineWidth } from '@blocksuite/affine-model';
import { on, once } from '@blocksuite/affine-shared/utils';
import { WithDisposable } from '@blocksuite/global/lit';
import { css, html, LitElement, nothing, type PropertyValues } from 'lit';
import { property, query } from 'lit/decorators.js';
import { repeat } from 'lit/directives/repeat.js';
import clamp from 'lodash-es/clamp';

interface Config {
  width: number;
  itemSize: number;
  itemIconSize: number;
  dragHandleSize: number;
  count: number;
}

export class EdgelessLineWidthPanel extends WithDisposable(LitElement) {
  static override styles = css`
    :host {
      display: flex;
      align-items: center;
      justify-content: center;
      align-self: stretch;

      --width: 140px;
      --item-size: 16px;
      --item-icon-size: 8px;
      --drag-handle-size: 14px;
      --cursor: 0;
      --count: 6;
      /* (16 - 14) / 2 + (cursor / (count - 1)) * (140 - 16) */
      --drag-handle-center-x: calc(
        (var(--item-size) - var(--drag-handle-size)) / 2 +
          (var(--cursor) / (var(--count) - 1)) *
          (var(--width) - var(--item-size))
      );
    }

    :host([disabled]) {
      opacity: 0.5;
      pointer-events: none;
    }

    .line-width-panel {
      width: var(--width);
      height: 24px;
      display: flex;
      flex-direction: row;
      align-items: center;
      justify-content: space-between;
      position: relative;
      cursor: default;
    }

    .line-width-button {
      display: flex;
      align-items: center;
      justify-content: center;
      width: var(--item-size);
      height: var(--item-size);
      z-index: 2;
    }

    .line-width-icon {
      width: var(--item-icon-size);
      height: var(--item-icon-size);
      background-color: var(--affine-border-color);
      border-radius: 50%;
    }

    .line-width-button[data-selected] .line-width-icon {
      background-color: var(--affine-icon-color);
    }

    .drag-handle {
      position: absolute;
      width: var(--drag-handle-size);
      height: var(--drag-handle-size);
      border-radius: 50%;
      background-color: var(--affine-icon-color);
      z-index: 3;
      transform: translateX(var(--drag-handle-center-x));
    }

    .bottom-line,
    .line-width-overlay {
      position: absolute;
      height: 1px;
      left: calc(var(--item-size) / 2);
    }

    .bottom-line {
      width: calc(100% - var(--item-size));
      background-color: var(--affine-border-color);
    }

    .line-width-overlay {
      background-color: var(--affine-icon-color);
      z-index: 1;
      width: var(--drag-handle-center-x);
    }
  `;

  private readonly _getDragHandlePosition = (e: PointerEvent) => {
    return clamp(e.offsetX, 0, this.config.width);
  };

  private readonly _onPointerDown = (e: PointerEvent) => {
    e.preventDefault();
    this._onPointerMove(e);

    const dispose = on(this, 'pointermove', this._onPointerMove);
    this._disposables.add(once(this, 'pointerup', dispose));
    this._disposables.add(once(this, 'pointerout', dispose));
  };

  private readonly _onPointerMove = (e: PointerEvent) => {
    e.preventDefault();

    const x = this._getDragHandlePosition(e);

    this._updateLineWidthPanelByDragHandlePosition(x);
  };

  private _onSelect(lineWidth: LineWidth) {
    // If the selected size is the same as the previous one, do nothing.
    if (lineWidth === this.selectedSize) return;
    this.dispatchEvent(
      new CustomEvent('select', {
        detail: lineWidth,
        bubbles: true,
        composed: true,
        cancelable: true,
      })
    );
    this.selectedSize = lineWidth;
  }

  private _updateLineWidthPanel(selectedSize: LineWidth) {
    if (!this._lineWidthOverlay) return;
    const index = this.lineWidths.findIndex(w => w === selectedSize);
    if (index === -1) return;

    this.style.setProperty('--cursor', `${index}`);
  }

  private _updateLineWidthPanelByDragHandlePosition(x: number) {
    // Calculate the selected size based on the drag handle position.
    // Need to select the nearest size.

    const {
      config: { width, itemSize, count },
      lineWidths,
    } = this;
    const targetWidth = width - itemSize;
    const halfItemSize = itemSize / 2;
    const offsetX = halfItemSize + (width - itemSize * count) / (count - 1) / 2;
    const selectedSize = lineWidths.findLast((_, n) => {
      const cx = halfItemSize + (n / (count - 1)) * targetWidth;
      return x >= cx - offsetX && x < cx + offsetX;
    });
    if (!selectedSize) return;

    this._updateLineWidthPanel(selectedSize);
    this._onSelect(selectedSize);
  }

  override connectedCallback() {
    super.connectedCallback();
    const {
      style,
      config: { width, itemSize, itemIconSize, dragHandleSize, count },
    } = this;
    style.setProperty('--width', `${width}px`);
    style.setProperty('--item-size', `${itemSize}px`);
    style.setProperty('--item-icon-size', `${itemIconSize}px`);
    style.setProperty('--drag-handle-size', `${dragHandleSize}px`);
    style.setProperty('--count', `${count}`);
  }

  override firstUpdated() {
    this._updateLineWidthPanel(this.selectedSize);
    this._disposables.addFromEvent(this, 'pointerdown', this._onPointerDown);
  }

  override render() {
    return html`<div class="line-width-panel">
      ${repeat(
        this.lineWidths,
        w => w,
        (w, n) =>
          html`<div
            class="line-width-button"
            aria-label=${w}
            data-index=${n}
            ?data-selected=${w <= this.selectedSize}
          >
            <div class="line-width-icon"></div>
          </div>`
      )}
      <div class="drag-handle"></div>
      <div class="bottom-line"></div>
      <div class="line-width-overlay"></div>
      ${this.hasTooltip
        ? html`<affine-tooltip .offset=${8}>Thickness</affine-tooltip>`
        : nothing}
    </div>`;
  }

  override willUpdate(changedProperties: PropertyValues<this>) {
    if (changedProperties.has('selectedSize')) {
      this._updateLineWidthPanel(this.selectedSize);
    }
  }

  @query('.line-width-overlay')
  private accessor _lineWidthOverlay!: HTMLElement;

  accessor config: Config = {
    width: 140,
    itemSize: 16,
    itemIconSize: 8,
    dragHandleSize: 14,
    count: LINE_WIDTHS.length,
  };

  @property({ attribute: false, type: Boolean })
  accessor disabled = false;

  @property({ attribute: false })
  accessor hasTooltip = true;

  @property({ attribute: false })
  accessor lineWidths: LineWidth[] = LINE_WIDTHS;

  @property({ attribute: false })
  accessor selectedSize: LineWidth = LineWidth.Two;
}

declare global {
  interface HTMLElementTagNameMap {
    'edgeless-line-width-panel': EdgelessLineWidthPanel;
  }
}
