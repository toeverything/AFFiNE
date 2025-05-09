import { getFigmaSquircleSvgPath } from '@blocksuite/affine-shared/utils';
import { css, html, LitElement, svg, type TemplateResult } from 'lit';
import { property, state } from 'lit/decorators.js';

/**
 * ### A component to use figma 'smoothing radius'
 *
 * ```html
 * <smooth-corner
 *  .borderRadius=${10}
 *  .smooth=${0.5}
 *  .borderWidth=${2}
 *  .bgColor=${'white'}
 *   style="filter: drop-shadow(0px 0px 10px rgba(0, 0, 0, 0.1));"
 * >
 *    <h1>Smooth Corner</h1>
 * </smooth-corner>
 * ```
 *
 * **Just wrap your content with it.**
 * - There is a ResizeObserver inside to observe the size of the content.
 * - In order to use both border and shadow, we use svg to draw.
 *    - So we need to use `stroke` and `drop-shadow` to replace `border` and `box-shadow`.
 *
 * #### required properties
 * - `borderRadius`: Equal to the border-radius
 * - `smooth`: From 0 to 1, refer to the figma smoothing radius
 *
 * #### customizable style properties
 * Provides some commonly used styles, dealing with their mapping with SVG attributes, such as:
 * - `borderWidth` (stroke-width)
 * - `borderColor` (stroke)
 * - `bgColor` (fill)
 * - `bgOpacity` (fill-opacity)
 *
 * #### More customization
 * Use css to customize this component, such as drop-shadow:
 * ```css
 * smooth-corner {
 *  filter: drop-shadow(0px 0px 10px rgba(0, 0, 0, 0.1));
 * }
 * ```
 */
export class SmoothCorner extends LitElement {
  static override styles = css`
    :host {
      position: relative;
    }
    .smooth-corner-bg,
    .smooth-corner-border {
      position: absolute;
      top: 0;
      left: 0;
      pointer-events: none;
    }
    .smooth-corner-border {
      z-index: 2;
    }
    .smooth-corner-content {
      position: relative;
      z-index: 1;
      width: 100%;
      height: 100%;
    }
  `;

  private readonly _resizeObserver: ResizeObserver | null = null;

  get _path() {
    return getFigmaSquircleSvgPath({
      width: this.width,
      height: this.height,
      cornerRadius: this.borderRadius, // defaults to 0
      cornerSmoothing: this.smooth, // cornerSmoothing goes from 0 to 1
    });
  }

  constructor() {
    super();
    this._resizeObserver = new ResizeObserver(entries => {
      for (const entry of entries) {
        this.width = entry.contentRect.width;
        this.height = entry.contentRect.height;
      }
    });
  }

  private _getSvg(className: string, path: TemplateResult) {
    return svg`<svg
      class="${className}"
      width=${this.width + this.borderWidth}
      height=${this.height + this.borderWidth}
      viewBox="0 0 ${this.width + this.borderWidth} ${
        this.height + this.borderWidth
      }"
      xmlns="http://www.w3.org/2000/svg"
    >
      ${path}
    </svg>`;
  }

  override connectedCallback(): void {
    super.connectedCallback();
    this._resizeObserver?.observe(this);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this._resizeObserver?.unobserve(this);
  }

  override render() {
    return html`${this._getSvg(
        'smooth-corner-bg',
        svg`<path
          d="${this._path}"
          fill="${this.bgColor}"
          fill-opacity="${this.bgOpacity}"
          transform="translate(${this.borderWidth / 2} ${this.borderWidth / 2})"
        >`
      )}
      ${this._getSvg(
        'smooth-corner-border',
        svg`<path
          fill="none"
          d="${this._path}"
          stroke="${this.borderColor}"
          stroke-width="${this.borderWidth}"
          transform="translate(${this.borderWidth / 2} ${this.borderWidth / 2})"
        >`
      )}
      <div class="smooth-corner-content">
        <slot></slot>
      </div>`;
  }

  /**
   * Background color of the element
   */
  @property({ type: String })
  accessor bgColor: string = 'white';

  /**
   * Background opacity of the element
   */
  @property({ type: Number })
  accessor bgOpacity: number = 1;

  /**
   * Border color of the element
   */
  @property({ type: String })
  accessor borderColor: string = 'black';

  /**
   * Equal to the border-radius
   */
  @property({ type: Number })
  accessor borderRadius = 0;

  /**
   * Border width of the element in px
   */
  @property({ type: Number })
  accessor borderWidth: number = 2;

  @state()
  accessor height: number = 0;

  /**
   * From 0 to 1
   */
  @property({ type: Number })
  accessor smooth: number = 0;

  @state()
  accessor width: number = 0;
}

declare global {
  interface HTMLElementTagNameMap {
    'smooth-corner': SmoothCorner;
  }
}
