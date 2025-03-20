import type { LineDetailType } from '@blocksuite/affine-components/edgeless-line-styles-panel';
import { type ColorScheme, type StrokeStyle } from '@blocksuite/affine-model';
import type { ColorEvent } from '@blocksuite/affine-shared/utils';
import { WithDisposable } from '@blocksuite/global/lit';
import { css, html, LitElement } from 'lit';
import { property } from 'lit/decorators.js';

export class StrokeStylePanel extends WithDisposable(LitElement) {
  static override styles = css`
    :host {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
    }

    .line-styles {
      display: flex;
      flex-direction: row;
      gap: 8px;
      align-items: center;
    }
  `;

  override render() {
    return html`
      <div class="line-styles">
        <edgeless-line-styles-panel
          .lineSize=${this.strokeWidth}
          .lineStyle=${this.strokeStyle}
          @select=${this.setStrokeStyle}
        >
        </edgeless-line-styles-panel>
      </div>
      <editor-toolbar-separator
        data-orientation="horizontal"
      ></editor-toolbar-separator>
      <edgeless-color-panel
        role="listbox"
        aria-label="Border colors"
        .value=${this.strokeColor}
        .theme=${this.theme}
        .hollowCircle=${this.hollowCircle}
        @select=${(e: ColorEvent) => this.setStrokeColor(e)}
      >
      </edgeless-color-panel>
    `;
  }

  @property({ attribute: false })
  accessor hollowCircle: boolean | undefined = undefined;

  @property({ attribute: false })
  accessor setStrokeColor!: (e: ColorEvent) => void;

  @property({ attribute: false })
  accessor setStrokeStyle!: (e: LineDetailType) => void;

  @property({ attribute: false })
  accessor strokeColor!: string;

  @property({ attribute: false })
  accessor strokeStyle!: StrokeStyle;

  @property({ attribute: false })
  accessor strokeWidth!: number;

  @property({ attribute: false })
  accessor theme!: ColorScheme;
}
