import { unsafeCSSVarV2 } from '@blocksuite/affine-shared/theme';
import katex from 'katex';
import { html } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';

export const LatexTooltip = (
  str: string,
  latex: string,
  displayMode: boolean = false
) =>
  html` <style>
      .latex-tooltip {
        background: ${unsafeCSSVarV2('layer/pureWhite')};
        border-radius: 2px;
        width: 170px;
        padding: 5px 5px 5px 6px;
        box-sizing: border-box;
      }
      .latex-tooltip-content {
        width: 159px;
        color: #121212;
        font-family: var(--affine-font-family);
        font-size: 10px;
        font-style: normal;

        .katex > math[display='block'] {
          margin-top: 1em;
        }
      }
    </style>
    <div class="latex-tooltip">
      <div class="latex-tooltip-content">
        <span>${str}</span>
        ${unsafeHTML(
          katex.renderToString(latex, {
            displayMode,
            output: 'mathml',
          })
        )}
      </div>
    </div>`;
