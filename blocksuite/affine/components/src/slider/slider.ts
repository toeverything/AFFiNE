import { on, once } from '@blocksuite/affine-shared/utils';
import { clamp } from '@blocksuite/global/gfx';
import { WithDisposable } from '@blocksuite/global/lit';
import { PropTypes, requiredProperties } from '@blocksuite/std';
import { html, LitElement, nothing, type PropertyValues } from 'lit';
import { property } from 'lit/decorators.js';
import { repeat } from 'lit/directives/repeat.js';

import { styles } from './styles';
import type { SliderRange, SliderSelectEvent, SliderStyle } from './types';
import { isDiscreteRange } from './utils';

const defaultSliderStyle: SliderStyle = {
  width: '100%',
  itemSize: 16,
  itemIconSize: 8,
  dragHandleSize: 14,
};

@requiredProperties({
  range: PropTypes.of(isDiscreteRange),
})
export class Slider extends WithDisposable(LitElement) {
  static override styles = styles;

  @property({ attribute: false })
  accessor value: number = 0;

  @property({ attribute: true, type: Boolean })
  accessor disabled = false;

  @property({ attribute: false })
  accessor tooltip: string | undefined = undefined;

  @property({ attribute: false })
  accessor range!: SliderRange;

  @property({ attribute: false })
  accessor sliderStyle: Partial<SliderStyle> | undefined = defaultSliderStyle;

  private get _sliderStyle(): SliderStyle {
    return {
      ...defaultSliderStyle,
      ...this.sliderStyle,
    };
  }

  private _onSelect(value: number) {
    this.dispatchEvent(
      new CustomEvent('select', {
        detail: { value },
        bubbles: true,
        composed: true,
      }) satisfies SliderSelectEvent
    );
  }

  private _updateLineWidthPanelByDragHandlePosition(x: number) {
    // Calculate the selected size based on the drag handle position.
    // Need to select the nearest size.

    const {
      _sliderStyle: { itemSize },
    } = this;

    const width = this.getBoundingClientRect().width;

    const { points } = this.range;
    const count = points.length;

    const targetWidth = width - itemSize;
    const halfItemSize = itemSize / 2;
    const offsetX = halfItemSize + (width - itemSize * count) / (count - 1) / 2;
    const selectedSize = points.findLast((_, n) => {
      const cx = halfItemSize + (n / (count - 1)) * targetWidth;
      return x >= cx - offsetX && x < cx + offsetX;
    });
    if (!selectedSize) return;

    this._onSelect(selectedSize);
  }

  private readonly _getDragHandlePosition = (e: PointerEvent) => {
    const width = this.getBoundingClientRect().width;
    return clamp(e.offsetX, 0, width);
  };

  private readonly _onPointerDown = (e: PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    this._onPointerMove(e);

    const dispose = on(this, 'pointermove', this._onPointerMove);
    this._disposables.add(once(this, 'pointerup', dispose));
    this._disposables.add(once(this, 'pointerleave', dispose));
  };

  private readonly _onPointerMove = (e: PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const x = this._getDragHandlePosition(e);

    this._updateLineWidthPanelByDragHandlePosition(x);
  };

  override connectedCallback() {
    super.connectedCallback();

    this._disposables.addFromEvent(this, 'pointerdown', this._onPointerDown);
    this._disposables.addFromEvent(this, 'click', e => {
      e.stopPropagation();
    });
  }

  override willUpdate(changedProperties: PropertyValues<this>) {
    const { style } = this;
    if (changedProperties.has('sliderStyle')) {
      const {
        _sliderStyle: { width, itemSize, itemIconSize, dragHandleSize },
      } = this;
      style.setProperty('--width', width);
      style.setProperty('--item-size', `${itemSize}px`);
      style.setProperty('--item-icon-size', `${itemIconSize}px`);
      style.setProperty('--drag-handle-size', `${dragHandleSize}px`);
    }
    if (changedProperties.has('range')) {
      style.setProperty('--count', `${this.range.points.length}`);
    }
    if (changedProperties.has('value')) {
      const index = this.range.points.findIndex(p => p === this.value);
      style.setProperty('--cursor', `${index}`);
    }
  }

  override render() {
    return html`<div class="slider-container">
      ${repeat(
        this.range.points,
        w => w,
        (w, n) =>
          html`<div
            class="point-button"
            aria-label=${w}
            data-index=${n}
            ?data-selected=${w <= this.value}
          >
            <div class="point-circle"></div>
          </div>`
      )}
      <div class="drag-handle"></div>
      <div class="bottom-line"></div>
      <div class="slider-selected-overlay"></div>
      ${this.tooltip
        ? html`<affine-tooltip .offset=${8}>${this.tooltip}</affine-tooltip>`
        : nothing}
    </div>`;
  }
}
