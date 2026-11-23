import { css, unsafeCSS } from 'lit';

import { unsafeCSSVarV2 } from '../theme/css-variables';
import { fontSMStyle } from './font';

export const panelBaseColorsStyle = (container: string) => css`
  ${unsafeCSS(container)} {
    color: var(--affine-icon-color);
    box-shadow: var(--affine-overlay-shadow);
    background: ${unsafeCSSVarV2('layer/background/overlayPanel')};
  }
`;

export const panelBaseStyle = (container: string) => css`
  ${unsafeCSS(container)} {
    display: flex;
    align-items: center;
    gap: 8px;
    width: max-content;
    padding: 0 6px;
    border-radius: 8px;
    border: 0.5px solid ${unsafeCSSVarV2('layer/insideBorder/border')};
  }
  ${panelBaseColorsStyle(container)}
  ${fontSMStyle(container)}
`;
