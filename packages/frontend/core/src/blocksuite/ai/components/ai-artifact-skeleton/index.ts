import { unsafeCSSVarV2 } from '@blocksuite/affine-shared/theme';
import { css, html, LitElement, nothing, type TemplateResult } from 'lit';
import { property } from 'lit/decorators.js';

/**
 * ArtifactSkeleton
 *
 * A lightweight loading skeleton used while an artifact preview is fetching / processing.
 * It mimics the layout of a document – an optional icon followed by several animated grey lines.
 *
 * Animation is implemented with pure CSS keyframes (no framer-motion dependency).
 * Only a single prop is supported for now:
 *   - `icon` – TemplateResult that will be rendered at the top-left position.
 */
export class ArtifactSkeleton extends LitElement {
  /* ----- Styling --------------------------------------------------------------------------- */
  static override styles = css`
    :host {
      /* The host is an inline-block so it can size to its contents. */
      display: inline-block;
      position: relative;
      /* The size roughly follows the design used in the legacy React implementation. */
      width: 250px;
      height: 200px;
      box-sizing: border-box;
    }

    /* Optional icon wrapper */
    .icon {
      position: absolute;
      top: 10px;
      left: 11px;
      width: 32px;
      height: 32px;

      svg {
        color: ${unsafeCSSVarV2('icon/activated')};
        width: 100%;
        height: 100%;
      }
    }

    /* Base line style */
    .line {
      position: absolute;
      left: 11px;
      height: 10px;
      border-radius: 6px;
      background-color: ${unsafeCSSVarV2('layer/background/tertiary')};
    }

    /* Keyframes for each line – width cycles through a handful of values to create movement */
    @keyframes line1Anim {
      0%,
      100% {
        width: 98px;
      }
      25% {
        width: 120px;
      }
      50% {
        width: 85px;
      }
      75% {
        width: 110px;
      }
    }
    @keyframes line2Anim {
      0%,
      100% {
        width: 195px;
      }
      30% {
        width: 180px;
      }
      60% {
        width: 210px;
      }
      80% {
        width: 165px;
      }
    }
    @keyframes line3Anim {
      0%,
      100% {
        width: 163px;
      }
      40% {
        width: 140px;
      }
      70% {
        width: 180px;
      }
      90% {
        width: 155px;
      }
    }
    @keyframes line4Anim {
      0%,
      100% {
        width: 107px;
      }
      20% {
        width: 130px;
      }
      60% {
        width: 90px;
      }
      85% {
        width: 115px;
      }
    }
    @keyframes line5Anim {
      0%,
      100% {
        width: 134px;
      }
      35% {
        width: 160px;
      }
      65% {
        width: 120px;
      }
      80% {
        width: 145px;
      }
    }
    @keyframes line6Anim {
      0%,
      100% {
        width: 154px;
      }
      30% {
        width: 135px;
      }
      55% {
        width: 175px;
      }
      75% {
        width: 160px;
      }
    }

    .line1 {
      top: 48.5px;
      animation: line1Anim 3.2s ease-in-out infinite;
    }
    .line2 {
      top: 73.5px;
      animation: line2Anim 4.1s ease-in-out infinite;
    }
    .line3 {
      top: 98.5px;
      animation: line3Anim 2.8s ease-in-out infinite;
    }
    .line4 {
      top: 123.5px;
      animation: line4Anim 3.7s ease-in-out infinite;
    }
    .line5 {
      top: 148.5px;
      animation: line5Anim 3.5s ease-in-out infinite;
    }
    .line6 {
      top: 170.5px;
      animation: line6Anim 4.3s ease-in-out infinite;
    }
  `;

  /* ----- Public API ------------------------------------------------------------------------ */
  /**
   * Optional icon rendered at the top-left corner.
   * It should be a lit `TemplateResult`, typically an inline SVG.
   */
  @property({ attribute: false })
  accessor icon: TemplateResult | null = null;

  /* ----- Render --------------------------------------------------------------------------- */
  override render() {
    return html`
      ${this.icon ? html`<div class="icon">${this.icon}</div>` : nothing}
      <div class="line line1"></div>
      <div class="line line2"></div>
      <div class="line line3"></div>
      <div class="line line4"></div>
      <div class="line line5"></div>
      <div class="line line6"></div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'artifact-skeleton': ArtifactSkeleton;
  }
}
