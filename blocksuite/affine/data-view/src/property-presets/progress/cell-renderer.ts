import { html } from 'lit';
import { query, state } from 'lit/decorators.js';
import { styleMap } from 'lit/directives/style-map.js';

import { BaseCellRenderer } from '../../core/property/index.js';
import { createFromBaseCellRenderer } from '../../core/property/renderer.js';
import { startDrag } from '../../core/utils/drag.js';
import { createIcon } from '../../core/utils/uni-icon.js';
import {
  progressBarStyle,
  progressBgStyle,
  progressCellStyle,
  progressContainerStyle,
  progressDragHandleStyle,
  progressFgStyle,
  progressNumberStyle,
} from './cell-renderer-css.js';
import { progressPropertyModelConfig } from './define.js';

const progressColors = {
  empty: 'var(--affine-black-10)',
  processing: 'var(--affine-processing-color)',
  success: 'var(--affine-success-color)',
};

export class ProgressCell extends BaseCellRenderer<number, number> {
  startDrag = (event: MouseEvent) => {
    if (!this.isEditing$.value) return;

    const bgRect = this._progressBg.getBoundingClientRect();
    const min = bgRect.left;
    const max = bgRect.right;
    const setValue = (x: number) => {
      this.tempValue = Math.round(
        ((Math.min(max, Math.max(min, x)) - min) / (max - min)) * 100
      );
    };
    startDrag(event, {
      onDrag: ({ x }) => {
        setValue(x);
        return;
      },
      onMove: ({ x }) => {
        setValue(x);
        return;
      },
      onDrop: () => {
        //
      },
      onClear: () => {
        //
      },
    });
  };

  get _value() {
    return this.isEditing$.value
      ? (this.tempValue ?? this.value ?? 0)
      : (this.value ?? 0);
  }

  _onChange(value?: number) {
    this.tempValue = value;
  }

  override firstUpdated() {
    const disposables = this._disposables;

    disposables.addFromEvent(this._progressBg, 'pointerdown', this.startDrag);

    disposables.addFromEvent(window, 'keydown', evt => {
      if (!this.isEditing$.value) {
        return;
      }
      if (evt.key === 'ArrowDown' || evt.key === 'ArrowLeft') {
        evt.preventDefault();
        this._onChange(Math.max(0, this._value - 1));
        return;
      }
      if (evt.key === 'ArrowUp' || evt.key === 'ArrowRight') {
        evt.preventDefault();
        this._onChange(Math.min(100, this._value + 1));
        return;
      }
    });
  }

  preventDefault(e: ClipboardEvent) {
    e.stopPropagation();
  }

  override onCopy(_e: ClipboardEvent) {
    this.preventDefault(_e);
  }

  override onCut(_e: ClipboardEvent) {
    this.preventDefault(_e);
  }

  override beforeExitEditingMode() {
    const value = this._value;
    this.valueSetNextTick(value);
  }

  override onPaste(_e: ClipboardEvent) {
    this.preventDefault(_e);
  }

  protected override render() {
    const progress = this._value;
    let backgroundColor = progressColors.processing;
    if (progress === 100) {
      backgroundColor = progressColors.success;
    }
    const fgStyles = styleMap({
      width: `${progress}%`,
      backgroundColor,
    });
    const bgStyles = styleMap({
      backgroundColor:
        progress === 0 ? progressColors.empty : 'var(--affine-hover-color)',
    });

    return html`
      <div class="${progressCellStyle}">
        <div class="${progressContainerStyle}">
          <div class="${progressBarStyle}">
            <div
              class="${progressBgStyle}"
              data-testid="progress-background"
              style=${bgStyles}
            >
              <div class="${progressFgStyle}" style=${fgStyles}></div>
              ${this.isEditing$.value
                ? html` <div
                    class="${progressDragHandleStyle}"
                    data-testid="progress-drag-handle"
                    style=${styleMap({
                      left: `calc(${progress}% - 3px)`,
                    })}
                  ></div>`
                : ''}
            </div>
          </div>
          <span class="${progressNumberStyle}" data-testid="progress"
            >${progress}</span
          >
        </div>
      </div>
    `;
  }

  @query(`.${progressBgStyle}`)
  private accessor _progressBg!: HTMLElement;

  @state()
  private accessor tempValue: number | undefined = undefined;
}

export const progressPropertyConfig =
  progressPropertyModelConfig.createPropertyMeta({
    icon: createIcon('ProgressIcon'),
    cellRenderer: {
      view: createFromBaseCellRenderer(ProgressCell),
    },
  });
