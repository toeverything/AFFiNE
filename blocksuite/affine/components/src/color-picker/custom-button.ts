import { css, html, LitElement } from 'lit';
import { property } from 'lit/decorators.js';

export class EdgelessColorCustomButton extends LitElement {
  static override styles = css`
    :host {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 24px;
      height: 24px;
      cursor: pointer;
    }

    :host([active]):after {
      position: absolute;
      display: block;
      content: '';
      width: 27px;
      height: 27px;
      border: 1.5px solid var(--affine-primary-color);
      border-radius: 50%;
      box-sizing: border-box;
      overflow: hidden;
      pointer-events: none;
    }

    .color-custom {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 21px;
      height: 21px;
      border-radius: 50%;
      box-sizing: border-box;
      overflow: hidden;
      padding: 2px;
      border: 2px solid transparent;
      background:
        linear-gradient(var(--c, transparent), var(--c, transparent))
          content-box,
        linear-gradient(var(--b, transparent), var(--b, transparent))
          padding-box,
        conic-gradient(
            from 180deg at 50% 50%,
            #d21c7e 0deg,
            #c240f0 30.697514712810516deg,
            #434af5 62.052921652793884deg,
            #3cb5f9 93.59999656677246deg,
            #3ceefa 131.40000343322754deg,
            #37f7bd 167.40000128746033deg,
            #2df541 203.39999914169312deg,
            #e7f738 239.40000772476196deg,
            #fbaf3e 273.07027101516724deg,
            #fd904e 300.73712825775146deg,
            #f64545 329.47510957717896deg,
            #f040a9 359.0167021751404deg
          )
          border-box;
    }
  `;

  override render() {
    return html`<div class="color-unit color-custom"></div>`;
  }

  @property({ attribute: true, type: Boolean })
  accessor active: boolean = false;
}
