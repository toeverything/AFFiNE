import { stopPropagation } from '@blocksuite/affine-shared/utils';
import { css, html, LitElement } from 'lit';
import { property } from 'lit/decorators.js';
import { repeat } from 'lit/directives/repeat.js';
import clamp from 'lodash-es/clamp';

const MIN_SCALE = 0;
const MAX_SCALE = 400;

const SCALE_LIST = [50, 100, 200] as const;

function format(scale: number) {
  return `${scale}%`;
}

// TODO(@fundon): remove it after refacting is completed
export class EdgelessScalePanel extends LitElement {
  static override styles = css`
    :host {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 4px;
      width: 68px;
    }

    edgeless-tool-icon-button {
      align-self: stretch;
    }

    .scale-input {
      display: flex;
      align-self: stretch;
      border: 0.5px solid var(--affine-border-color);
      border-radius: 8px;
      padding: 4px 8px;
      box-sizing: border-box;
    }

    .scale-input::placeholder {
      color: var(--affine-placeholder-color);
    }

    .scale-input:focus {
      outline-color: var(--affine-primary-color);
      outline-width: 0.5px;
    }
  `;

  private readonly _onKeydown = (e: KeyboardEvent) => {
    e.stopPropagation();

    if (e.key === 'Enter' && !e.isComposing) {
      e.preventDefault();
      const input = e.target as HTMLInputElement;
      const scale = parseInt(input.value.trim());
      // Handle edge case where user enters a non-number
      if (isNaN(scale)) {
        input.value = '';
        return;
      }

      // Handle edge case when user enters a number that is out of range
      this._onSelect(clamp(scale, this.minScale, this.maxScale));
      input.value = '';
      this._onPopperClose();
    }
  };

  private _onPopperClose() {
    this.onPopperCose?.();
  }

  private _onSelect(scale: number) {
    this.onSelect?.(scale / 100);
  }

  override render() {
    return html`
      ${repeat(
        this.scaleList,
        scale => scale,
        scale => {
          const classes = `scale-${scale}`;
          return html`<edgeless-tool-icon-button
            class=${classes}
            .iconContainerPadding=${[4, 8]}
            .activeMode=${'background'}
            .active=${this.scale === scale}
            @click=${() => this._onSelect(scale)}
          >
            ${format(scale)}
          </edgeless-tool-icon-button>`;
        }
      )}

      <input
        class="scale-input"
        type="text"
        inputmode="numeric"
        pattern="[0-9]*"
        min="0"
        placeholder=${format(Math.trunc(this.scale))}
        @keydown=${this._onKeydown}
        @input=${stopPropagation}
        @click=${stopPropagation}
        @pointerdown=${stopPropagation}
        @cut=${stopPropagation}
        @copy=${stopPropagation}
        @paste=${stopPropagation}
      />
    `;
  }

  @property({ attribute: false })
  accessor maxScale: number = MAX_SCALE;

  @property({ attribute: false })
  accessor minScale: number = MIN_SCALE;

  @property({ attribute: false })
  accessor onPopperCose: (() => void) | undefined = undefined;

  @property({ attribute: false })
  accessor onSelect: ((size: number) => void) | undefined = undefined;

  @property({ attribute: false })
  accessor scale!: number;

  @property({ attribute: false })
  accessor scaleList: readonly number[] = SCALE_LIST;
}
